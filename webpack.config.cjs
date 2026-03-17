const path = require("node:path");
const nodeExternals = require("webpack-node-externals");

module.exports = {
  target: "node20",
  externalsPresets: { node: true },
  externals: [nodeExternals()],
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.cjs",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: "swc-loader",
          options: {
            jsc: {
              parser: {
                syntax: "typescript",
              },
              target: "es2022",
            },
          },
        },
      },
    ],
  },
  devtool: "source-map",
};
