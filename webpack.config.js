
const path = require('path');

module.exports = {
  devtool: "source-map",
  entry: './src/javascript/app.js',
  output: {
    path: path.resolve(__dirname, 'build/javascript/'),
    filename: 'app.js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: [/node_modules/],
        use: [{
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }]
      }
    ]
  }
};
