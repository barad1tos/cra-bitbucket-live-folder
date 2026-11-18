<a href="https://crabrowser.app/">
  <img src="https://raw.githubusercontent.com/VictorKildahl/cra/3b96bad2d0735963d9701c4035d2136e453cc197/brand/cra-segments.svg" width="88" alt="Cra browser mark">
</a>

# Bitbucket Live Folder for Cra

Your Bitbucket Data Center pull requests and review requests in the Cra sidebar.

[Install the plugin](#install) · [Get Cra](https://crabrowser.app/) · [Cra on GitHub](https://github.com/VictorKildahl/cra)

This community plugin adds Bitbucket Data Center to [Cra](https://crabrowser.app/), the open-source macOS browser created by Victor Kildahl. Cra keeps Live Folders up to date in the sidebar. Each Bitbucket folder can point to a different server and uses the signed-in profile for its Space.

## Install

You’ll need Cra for macOS with Live Folder plugin support and access to a Bitbucket Data Center instance.

1. Sign in to GitHub and open the latest successful [CI run on `main`](https://github.com/barad1tos/cra-bitbucket-live-folder/actions/workflows/ci.yml?query=branch%3Amain). Under **Artifacts**, download `cra-bitbucket-plugin.zip`.
2. In Cra, open **Settings → Plugins → Add Plugin…** and select the ZIP. If your version lists **Live folder plugins** under **Settings → Extensions**, use **Add Plugin…** there.
3. In the Space where you use Bitbucket, run **New Bitbucket Live Folder** from Cra’s command bar. Enter the server address you use in your browser, such as `bitbucket.example.com` or `https://bitbucket.example.com:8443/git`.
4. If prompted, sign in to Bitbucket in that same Space so the folder can use its browser session.

## Use the folder

- **My Pull Requests** shows open pull requests you authored.
- **Review Requests** shows open pull requests that list you as a reviewer.
- Both filters start enabled. Use the folder menu to toggle either filter or hide individual repositories.

## Build and test

Use Node.js 26 with `zip` and `unzip` installed.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run package
```

The build compiles [`plugin/main.ts`](plugin/main.ts) to the JavaScript entry point Cra loads. The installable `cra-bitbucket-plugin.zip` is written to the repository root. Tests exercise the packaged provider with simulated Bitbucket responses.

To run the repository’s CI lint checks locally, install `prek` and `uv`, then run `prek run --all-files --hook-stage manual`. If your clone uses Git’s default hook directory, activate its pre-commit hooks with `prek install --hook-type pre-commit`.

## Cra project

- [Live Folder plugin guide](https://github.com/VictorKildahl/cra/blob/v0.1.48/docs/live-folder-plugins.md)
- [Discussion about bundling Bitbucket support in Cra](https://github.com/VictorKildahl/cra/discussions/541)
- [Cra brand mark](https://github.com/VictorKildahl/cra/tree/3b96bad2d0735963d9701c4035d2136e453cc197/brand) by the Cra project
