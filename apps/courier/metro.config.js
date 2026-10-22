const { getDefaultConfig } = require("expo/metro-config");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

/**
 * The repository is a pnpm workspace, but the dependencies are installed per
 * application with npm. Metro computes the watch folders from the workspace
 * layout and therefore expects a `<workspace>/node_modules` folder that does
 * not exist on disk, which makes the bundler fail at startup with
 * "ENOENT: no such file or directory, stat '<workspace>/node_modules'".
 *
 * Only the folders that are really present are kept.
 */
config.watchFolders = (config.watchFolders ?? []).filter((folder) => fs.existsSync(folder));

/**
 * The shared package is consumed from its TypeScript source, so Metro has to
 * watch it and has to be able to resolve it from the app.
 */
const sharedPackage = path.resolve(projectRoot, "..", "..", "packages", "shared");
if (fs.existsSync(sharedPackage) && !config.watchFolders.includes(sharedPackage)) {
  config.watchFolders.push(sharedPackage);
}

module.exports = config;
