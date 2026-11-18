type Filter = "authored" | "review";
type Role = "AUTHOR" | "REVIEWER";
type ErrorCode = "notSignedIn" | "rateLimited" | "network" | "unexpectedPage";
type JsonObject = Record<string, unknown>;

interface CraBridge {
    session: {
        fetch(url: string, options: { headers: { Accept: string } }): {
            status: number;
            url: string;
            body: string;
        };
    };
}

interface FolderAddress {
    settings: { server: string };
}

interface RefreshInput extends FolderAddress {
    filters: readonly string[];
}

interface FolderPresentation {
    folderTitle: string;
    menuTitle: string;
    icon: string;
    filters: { id: Filter; title: string; enabledByDefault: boolean }[];
    groups: { title: string; description: string };
    setup: {
        key: "server";
        title: string;
        message: string;
        placeholder: string;
        defaultValue: string;
        invalidTitle: string;
        invalidMessage: string;
    };
    statusMessages: Record<ErrorCode, string>;
}

interface FolderItem {
    id: string;
    url: string;
    title: string;
    subtitle: string | null;
    group: string;
    createdAt: number | null;
}

interface FolderSnapshot {
    items: FolderItem[];
    actions: [];
    preservedGroups: [];
}

interface SignInInfo {
    title: string;
    url: string;
    warning: string;
    emptyText: string;
    failureText: string;
    failureURL: string;
    instanceLabel: string;
}

type FolderState = Record<string, string>;
type PageChange = { state: FolderState; refreshAfter: []; checkSignIn: boolean };
type PullRequestPage = { values: unknown[] } & (
    { isLastPage: true } | { isLastPage: false; nextPageStart: number }
);

interface BitbucketProvider {
    describe(): FolderPresentation;
    refresh(input: RefreshInput): FolderSnapshot;
    signIn(input: FolderAddress): SignInInfo;
    pageChanged(input: { state?: FolderState }): PageChange;
}

declare const cra: CraBridge;
declare function registerProvider(provider: BitbucketProvider): void;

function createBitbucketProvider(bridge: CraBridge): BitbucketProvider {
    const roles = {
        authored: "AUTHOR",
        review: "REVIEWER",
    } satisfies Record<Filter, Role>;

    const presentation: FolderPresentation = {
        folderTitle: "Bitbucket Pull Requests",
        menuTitle: "Pull Requests",
        icon: "icon.svg",
        filters: [
            { id: "authored", title: "My Pull Requests", enabledByDefault: true },
            { id: "review", title: "Review Requests", enabledByDefault: true },
        ],
        groups: { title: "Repositories", description: "Repositories with matching pull requests." },
        setup: {
            key: "server",
            title: "Add a Bitbucket Live Folder",
            message: "Enter your Bitbucket Data Center address. The folder uses this Space’s profile.",
            placeholder: "https://bitbucket.example.com",
            defaultValue: "",
            invalidTitle: "Invalid Bitbucket address",
            invalidMessage: "Enter the address you use to open Bitbucket, including its base path if needed.",
        },
        statusMessages: {
            notSignedIn: "Sign in to Bitbucket in this Space’s profile.",
            rateLimited: "Bitbucket’s rate limit was reached.",
            network: "Could not connect to Bitbucket.",
            unexpectedPage: "Could not load pull requests from the Bitbucket Data Center API.",
        },
    };

    const isRecord = (value: unknown): value is JsonObject =>
        typeof value === "object" && value !== null && !Array.isArray(value);

    const getProperty = (value: unknown, key: string): unknown =>
        isRecord(value) ? value[key] : undefined;

    const decodePage = (body: string, start: number): PullRequestPage => {
        let payload: unknown;
        try {
            payload = JSON.parse(body);
        } catch {
            throw new Error("unexpectedPage");
        }
        if (!isRecord(payload) || !Array.isArray(payload.values) ||
            typeof payload.isLastPage !== "boolean") {
            throw new Error("unexpectedPage");
        }
        const { values, isLastPage, nextPageStart } = payload;
        if (isLastPage) return { values, isLastPage };
        if (typeof nextPageStart !== "number" ||
            !Number.isSafeInteger(nextPageStart) || nextPageStart <= start) {
            throw new Error("unexpectedPage");
        }
        return { values, isLastPage, nextPageStart };
    };

    const readPage = (endpoint: string, role: Role, start: number): PullRequestPage => {
        const url = `${endpoint}?state=OPEN&role=${role}&limit=100&start=${start}`;
        const response = bridge.session.fetch(url, { headers: { Accept: "application/json" } });
        if (response.status === 0) throw new Error("network");
        if (response.status === 429) throw new Error("rateLimited");
        if (response.status === 401 || (response.status >= 300 && response.status < 400)) {
            throw new Error("notSignedIn");
        }
        if (response.status !== 200) throw new Error("unexpectedPage");
        if (response.url.split("?")[0] !== endpoint) throw new Error("notSignedIn");
        return decodePage(response.body, start);
    };

    const readSegment = (value: unknown): string => {
        if (typeof value !== "string" || !value || value === "." || value === "..") {
            throw new Error("unexpectedPage");
        }
        return value;
    };

    const makeItem = (request: unknown, server: string): FolderItem => {
        if (!isRecord(request)) throw new Error("unexpectedPage");
        const { state, id, title, createdDate } = request;
        if (state !== "OPEN" || typeof id !== "number" || !Number.isSafeInteger(id) ||
            id < 1 || typeof title !== "string") {
            throw new Error("unexpectedPage");
        }
        const repository = getProperty(request.toRef, "repository");
        const projectKey = readSegment(getProperty(getProperty(repository, "project"), "key"));
        const slug = readSegment(getProperty(repository, "slug"));
        const scope = projectKey.startsWith("~")
            ? `users/${encodeURIComponent(readSegment(projectKey.slice(1)))}`
            : `projects/${encodeURIComponent(projectKey)}`;
        const url = `${server}/${scope}/repos/${encodeURIComponent(slug)}/pull-requests/${id}/overview`;
        const author = getProperty(getProperty(request.author, "user"), "displayName");
        return {
            id: url,
            url,
            title,
            subtitle: typeof author === "string" ? author : null,
            group: `${projectKey}/${slug}`,
            createdAt: typeof createdDate === "number" && Number.isFinite(createdDate)
                ? createdDate / 1000 : null,
        };
    };

    const refresh = (input: RefreshInput): FolderSnapshot => {
        const { server } = input.settings;
        const endpoint = `${server}/rest/api/1.0/dashboard/pull-requests`;
        const items = new Map<string, FolderItem>();
        for (const [filter, role] of Object.entries(roles)) {
            if (!input.filters.includes(filter)) continue;
            let start = 0;
            while (true) {
                const page = readPage(endpoint, role, start);
                for (const request of page.values) {
                    const item = makeItem(request, server);
                    items.set(item.id, item);
                }
                if (page.isLastPage) break;
                start = page.nextPageStart;
            }
        }
        return {
            items: [...items.values()].sort((left, right) =>
                (right.createdAt ?? 0) - (left.createdAt ?? 0) || left.url.localeCompare(right.url)),
            actions: [],
            preservedGroups: [],
        };
    };

    return {
        describe(): FolderPresentation {
            return presentation;
        },
        refresh,
        signIn(input: FolderAddress): SignInInfo {
            const { server } = input.settings;
            return {
                title: "Sign In to Bitbucket…",
                url: server,
                warning: "Sign in to Bitbucket in this Space’s profile.",
                emptyText: "No open pull requests match your filters.",
                failureText: "Could not update this folder. Open Bitbucket to check the connection.",
                failureURL: server,
                instanceLabel: `Bitbucket (${server.replace(/^https?:\/\//, "")})`,
            };
        },
        pageChanged(input: { state?: FolderState }): PageChange {
            return { state: input.state ?? {}, refreshAfter: [], checkSignIn: true };
        },
    };
}

registerProvider(createBitbucketProvider(cra));
