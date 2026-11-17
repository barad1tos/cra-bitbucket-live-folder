import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { argv } from "node:process";
import createBitbucketProvider from "../plugin/main.js";

const pluginDirectory = new URL("../plugin/", import.meta.url);
const destination = resolve(argv[2] ?? "cra-bitbucket-plugin.zip");
const stagingDirectory = mkdtempSync(join(dirname(destination), ".cra-bitbucket-"));

try {
    for (const filename of ["manifest.json", "icon.svg"]) {
        copyFileSync(new URL(filename, pluginDirectory), join(stagingDirectory, filename));
    }

    // Cra evaluates the archived entry inside its own function and provides `cra`.
    const entry = `"use strict";\nreturn (${createBitbucketProvider.toString()})(cra);\n`;
    writeFileSync(join(stagingDirectory, "main.js"), entry);
    execFileSync("zip", ["-q", "-X", "plugin.zip", "manifest.json", "main.js", "icon.svg"], {
        cwd: stagingDirectory,
    });
    renameSync(join(stagingDirectory, "plugin.zip"), destination);
} finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
}
