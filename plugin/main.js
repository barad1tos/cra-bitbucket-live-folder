export default function createBitbucketProvider(cra) {
    const roles = {
        authored: "AUTHOR",
        review: "REVIEWER",
    };

    const presentation = {
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

    const readPage = (endpoint, role, start) => {
        const url = `${endpoint}?state=OPEN&role=${role}&limit=100&start=${start}`;
        const response = cra.session.fetch(url, { headers: { Accept: "application/json" } });
        if (response.status === 0) throw new Error("network");
        if (response.status === 429) throw new Error("rateLimited");
        if (response.status === 401 || (response.status >= 300 && response.status < 400)) {
            throw new Error("notSignedIn");
        }
        if (response.status !== 200) throw new Error("unexpectedPage");
        if (response.url.split("?")[0] !== endpoint) throw new Error("notSignedIn");

        let page;
        try {
            page = JSON.parse(response.body);
        } catch {
            throw new Error("unexpectedPage");
        }
        if (!Array.isArray(page?.values) || typeof page.isLastPage !== "boolean") {
            throw new Error("unexpectedPage");
        }
        if (!page.isLastPage && (!Number.isSafeInteger(page.nextPageStart) || page.nextPageStart <= start)) {
            throw new Error("unexpectedPage");
        }
        return page;
    };

    const encodeSegment = (value) => {
        if (typeof value !== "string" || !value || value === "." || value === "..") {
            throw new Error("unexpectedPage");
        }
        return encodeURIComponent(value);
    };

    const makeItem = (request, server) => {
        if (request?.state !== "OPEN" || !Number.isSafeInteger(request.id) ||
            request.id < 1 || typeof request.title !== "string") {
            throw new Error("unexpectedPage");
        }
        const repository = request.toRef?.repository;
        const projectKey = repository?.project?.key;
        const isPersonal = typeof projectKey === "string" && projectKey.startsWith("~");
        const scope = isPersonal
            ? `users/${encodeSegment(projectKey.slice(1))}`
            : `projects/${encodeSegment(projectKey)}`;
        const slug = encodeSegment(repository?.slug);
        const url = `${server}/${scope}/repos/${slug}/pull-requests/${request.id}/overview`;
        const author = request.author?.user?.displayName;
        return {
            id: url,
            url,
            title: request.title,
            subtitle: typeof author === "string" ? author : null,
            group: `${projectKey}/${repository.slug}`,
            createdAt: Number.isFinite(request.createdDate) ? request.createdDate / 1000 : null,
        };
    };

    const refresh = (input) => {
        const {server} = input.settings;
        const endpoint = `${server}/rest/api/1.0/dashboard/pull-requests`;
        const items = new Map();
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
        describe() {
            return presentation;
        },
        refresh,
        signIn(input) {
            const {server} = input.settings;
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
        pageChanged(input) {
            return { state: input.state ?? {}, refreshAfter: [], checkSignIn: true };
        },
    };
}
