// The app shares its search, vehicle catalogue, fee maths and formatting with the
// website (../src/lib), so the two never disagree. Metro needs to watch that folder.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const siteLib = path.resolve(projectRoot, "..", "src", "lib");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders || []), siteLib];
// Packages come from the app's own node_modules (the shared files import no packages).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
