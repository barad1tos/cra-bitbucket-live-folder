# Bitbucket Live Folder for Cra

A sidebar folder for open pull requests you authored or were asked to review in Bitbucket Data Center. Set the server address when you create each folder. Cra uses the signed-in browser profile for that Space.

## Install

1. In Cra, open **Settings → Extensions → Live folder plugins → Add Plugin…** and select `cra-bitbucket-plugin.zip`.
2. In the sidebar, open **Live Folders → Bitbucket…** or run **New Bitbucket Live Folder** from the command bar.
3. Enter the base address of your Bitbucket instance. Examples include `bitbucket.example.com` and `https://bitbucket.example.com:8443/git`.
4. Sign in to Bitbucket in the same Space if prompted. Use the folder menu to toggle **My Pull Requests** or **Review Requests**, or to hide a repository.

The package targets the Cra Live Folder API v1 and the Bitbucket Data Center REST API. Both filters are enabled by default. Cra handles authentication with the session for the configured origin.

## Test and package

Run these commands from the source directory with Node.js 26, `zip` and `unzip` available.

```sh
npm ci --ignore-scripts
npm test
npm run package
```

The packaging script generates the entry that Cra executes and puts it in `cra-bitbucket-plugin.zip`. The tests build and exercise the same archive format.

## Repository checks

The central Git hook runs this project's configuration through prek. With prek and uv on your PATH, run the same file and workflow checks as CI:

```sh
prek run --all-files --hook-stage manual
```

See the [Cra Live Folder developer guide](https://github.com/VictorKildahl/cra/blob/v0.1.48/docs/live-folder-plugins.md) and the [Bitbucket dashboard REST API](https://developer.atlassian.com/server/bitbucket/rest/v819/api-group-dashboard/#api-api-latest-dashboard-pull-requests-get).
