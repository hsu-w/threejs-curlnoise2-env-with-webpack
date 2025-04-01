module.exports = {
  mode: "development",
  entry: "./src/index.js",
  output: {
    path: `${__dirname}/public`,
    filename: "bundle.js",
  },
  devServer: {
    static: "./public",
  },
  resolve: {
    extensions: [".js", ".glsl"],
  },
  module: {
    rules: [
      //Javascript
      {
        test: /\.js?$/,
        exclude: /node_modules/,
        use: ["babel-loader"],
      },
      //Shader
      {
        test: /\.(glsl|vs|fs|vert|frag)$/,
        // use: ["raw-loader"],
        type: "asset/source",
        generator: {
          filenname: "assets/images/[hash][ext]"
        }
      },
      //Images
      {
        test: /\.(jpg|png|gif|svg)$/,
        type: "asset/resource",
        generator: {
          filename: "assets/images/[hash][ext]",
        },
      },
      //CSS
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      }
    ]
  }
}