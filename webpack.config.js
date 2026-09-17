const path = require("path");
const fs = require("fs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { log } = require("console");

// Webpack entry points. Mapping from resulting bundle name to the source file entry.
const entries = {};

// Loop through subfolders in the "Samples" folder and add an entry for each one
console.log(__dirname);
const samplesDir = path.join(__dirname, "src");
console.log(samplesDir);
fs.readdirSync(samplesDir).filter(dir => {
    if (fs.statSync(path.join(samplesDir, dir)).isDirectory()) {
        entries[dir] = "./" + path.relative(process.cwd(), path.join(samplesDir, dir, dir));
        console.log(entries[dir]);
    }
});

module.exports = {
    target: "node",
    entry: "./src/usedotnet.ts",
    output: {
        filename: "usedotnet.js"
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
    },
    externals: {
        "azure-pipelines-task-lib": "commonjs azure-pipelines-task-lib",
        "azure-pipelines-tasks-packaging-common": "commonjs azure-pipelines-tasks-packaging-common",
    },
    stats: {
        warnings: false
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader"
            },
        ]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: "./externals/**", to: "." },
                { from: "./task.json", to: "." },
                { from: "./task.loc.json", to: "." },
                { from: "./Strings/**", to: "." },
                { from: "./node_modules/azure-pipelines-task-lib", to: "./node_modules/azure-pipelines-task-lib" },
                { from: "./node_modules/azure-pipelines-tasks-packaging-common", to: "./node_modules/azure-pipelines-tasks-packaging-common" },
            ]
        })
    ]
};
