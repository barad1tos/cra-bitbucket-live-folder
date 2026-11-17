import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execPath } from "node:process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const server = "https://bitbucket.example.test:8443/git";
const testDirectory = mkdtempSync(join(tmpdir(), "cra-bitbucket-test-"));
const archive = join(testDirectory, "plugin.zip");
const input = {
    settings: { server },
    filters: ["authored", "review"],
    state: {},
};
const empty = { items: [], actions: [], preservedGroups: [] };
let entry;

before(() => {
    const packager = fileURLToPath(new URL("../scripts/package.mjs", import.meta.url));
    execFileSync(execPath, [packager, archive], { stdio: ["ignore", "pipe", "pipe"] });
    entry = readEntry("main.js");
});

after(() => rmSync(testDirectory, { recursive: true, force: true }));

function readEntry(name) {
    return execFileSync("unzip", ["-p", archive, name], { encoding: "utf8" });
}

/**
 * @param {(url: string, options: {headers: {Accept: string}}) => {status: number, url: string, body?: string}} [fetch]
 */
function loadProvider(fetch) {
    const session = { fetch: fetch ?? (() => assert.fail("Unexpected Bitbucket request")) };
    return runInNewContext(`(function () { ${entry}\n })()`, {
        cra: { session },
    }, { filename: "main.js", timeout: 1000 });
}

function toPlainValue(result) {
    return JSON.parse(JSON.stringify(result));
}

function pullRequest(id, title, slug = "backend", projectKey = "TEAM") {
    return {
        id,
        title,
        state: "OPEN",
        createdDate: 1760000000000 + id * 1000,
        author: { user: { displayName: "Test Author" } },
        fromRef: { repository: { slug: "fork", project: { key: "~contributor" } } },
        toRef: { repository: { slug, project: { key: projectKey } } },
    };
}

function makePage(url, values, nextPageStart) {
    return {
        status: 200,
        url,
        body: JSON.stringify({ values, nextPageStart, isLastPage: nextPageStart === undefined }),
    };
}

test("the folder's address field grants only the instance selected in Cra", () => {
    const presentation = loadProvider().describe();
    const manifest = JSON.parse(readEntry("manifest.json"));
    assert.equal(manifest.sessionSetting, presentation.setup.key);
    assert.deepEqual(manifest.sessionOrigins, []);
    assert.deepEqual(toPlainValue(presentation.filters.filter(filter => filter.enabledByDefault)
        .map(filter => filter.id)), ["authored", "review"]);
});

test("refresh follows the Bitbucket cursor and combines both open-PR roles", () => {
    const requests = [];
    const shared = pullRequest(7, "Use the target repository");
    const other = pullRequest(7, "Same ID in a different repository", "frontend");
    const personal = pullRequest(9, "Update a personal repository", "notes", "~alex");
    const provider = loadProvider((url, options) => {
        const request = new URL(url);
        assert.equal(`${request.origin}${request.pathname}`,
            `${server}/rest/api/1.0/dashboard/pull-requests`);
        assert.equal(options.headers.Accept, "application/json");
        assert.equal(request.searchParams.get("state"), "OPEN");
        const role = request.searchParams.get("role");
        const start = request.searchParams.get("start");
        requests.push([role, start]);
        if (role === "AUTHOR" && start === "0") return makePage(url, [shared], 41);
        if (role === "AUTHOR" && start === "41") return makePage(url, [other]);
        if (role === "REVIEWER" && start === "0") return makePage(url, [shared, personal]);
        assert.fail(`Unexpected request: ${role}, ${start}`);
    });

    const { items } = toPlainValue(provider.refresh(input));

    assert.deepEqual(requests, [["AUTHOR", "0"], ["AUTHOR", "41"], ["REVIEWER", "0"]]);
    assert.deepEqual(items.map(item => item.url), [
        `${server}/users/alex/repos/notes/pull-requests/9/overview`,
        `${server}/projects/TEAM/repos/backend/pull-requests/7/overview`,
        `${server}/projects/TEAM/repos/frontend/pull-requests/7/overview`,
    ]);
    assert.equal(new Set(items.map(item => item.id)).size, 3);
    assert.equal(items[1].title, "Use the target repository");
    assert.equal(items[1].group, "TEAM/backend");
    assert.equal(items[1].createdAt, 1760000007);
});

test("Cra can disable each role independently", () => {
    for (const [filter, expectedRole] of [["authored", "AUTHOR"], ["review", "REVIEWER"]]) {
        const roles = [];
        const provider = loadProvider(url => {
            roles.push(new URL(url).searchParams.get("role"));
            return makePage(url, []);
        });
        assert.deepEqual(toPlainValue(provider.refresh({ ...input, filters: [filter] })), empty);
        assert.deepEqual(roles, [expectedRole]);
    }
    assert.deepEqual(toPlainValue(loadProvider().refresh({ ...input, filters: [] })), empty);
});

test("sign-in opens the configured instance and can retry after navigation", () => {
    const provider = loadProvider();
    assert.equal(provider.signIn(input).url, server);
    assert.equal(provider.pageChanged(input).checkSignIn, true);
});

const failures = [
    { name: "an expired session", status: 401, expected: "notSignedIn" },
    { name: "a login redirect", status: 200, redirect: `${server}/login`, expected: "notSignedIn" },
    { name: "a rate limit", status: 429, expected: "rateLimited" },
    { name: "an unreachable server", status: 0, expected: "network" },
    {
        name: "an HTML response",
        status: 200,
        body: '<html lang="en"><title>Login</title></html>',
        expected: "unexpectedPage",
    },
    {
        name: "a repeating pagination cursor",
        status: 200,
        body: '{"values":[],"isLastPage":false,"nextPageStart":0}',
        expected: "unexpectedPage",
    },
];

for (const { name, status, redirect, body = "", expected } of failures) {
    test(`refresh reports ${name} without clearing the folder`, () => {
        const provider = loadProvider(url => ({ status, url: redirect ?? url, body }));
        assert.throws(() => provider.refresh(input), { message: expected });
    });
}

test("a later request failure never exposes a partial snapshot", () => {
    const provider = loadProvider(url => new URL(url).searchParams.get("start") === "0"
        ? makePage(url, [pullRequest(1, "First page")], 12)
        : { status: 503, url });
    assert.throws(() => provider.refresh(input), { message: "unexpectedPage" });
});
