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
        filename: "[name]/[name].js"
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
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
                { from: "./externals/**", to: "main" }
            ]
        })
    ]
};
