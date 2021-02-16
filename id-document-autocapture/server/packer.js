/*
Copyright 2020 Idemia Identity & Security

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/*
 * Prepare the front-end source to be exposed. Allow usage of backend-server variable under front-end sources.
 */
const path = require('path');
const config = require('./config');
const debug = require('debug')('front:packer');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const I18nPlugin = require('i18n-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const languages = { en: null };

config.SUPPORTED_LANGUAGES.split(',').forEach(lang => {
  try {
    if (lang !== 'en') {
      languages[lang] = require(`./config/i18n/${lang}.json`);
    }
  } catch (err) {
    debug(`Warning! No ${lang}.json found, fallback to english for this language`);
  }
});

exports.pack = function pack () {
  const mode = process.env.NODE_ENV ? 'production' : 'development';
  const devtool = process.env.NODE_ENV ? false : 'source-map';
  debug('>> process.env.NODE_ENV = ', process.env.NODE_ENV, { mode }, { devtool });
  Object.keys(languages).map(function (language) {
    debug('Generating ' + language + ' package ...');
    // doc capture
    return webpack({
      mode: mode,
      name: language,
      context: __dirname,
      entry: {
        index: '../front/templates/doc-auth/index.js',
        'detect-env': '../front/templates/doc-auth/detect-env.js'
      },
      devtool: devtool,
      output: {
        path: path.join(__dirname, '../front/doc-auth/' + language + '/js/'),
        publicPath: 'js',
        filename: '[name].js'
      },
      plugins: [
        new CleanWebpackPlugin(),
        new I18nPlugin(languages[language], { failOnMissing: true }),
        new HtmlWebpackPlugin({
          inject: false,
          filename: '../index.html', // relative to thisObj.output.path
          template: '../front/templates/doc-auth/index.html'
        }),
        new webpack.DefinePlugin({
          BASE_PATH: JSON.stringify(config.BASE_PATH),
          DOCSERVER_VIDEO_URL_WITH_BASE_PATH: JSON.stringify(config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH),
          DOCSERVER_VIDEO_URL: JSON.stringify(config.DOCSERVER_VIDEO_URL),
          DOC_SERVER_BASE_PATH: JSON.stringify(config.DOC_SERVER_BASE_PATH),
          DISABLE_CALLBACK: JSON.stringify(config.DISABLE_CALLBACK)
        }),
        new CopyPlugin([
          {
            from: '../front/templates/doc-auth/statics/',
            to: path.join(__dirname, '../front/doc-auth/' + language)
          }
        ])
      ]
    }).watch({ poll: 1000 }, (err, stats) => {
      if (err) {
        throw err;
      }
      const jsonStats = stats.toJson();
      if (jsonStats.errors.length > 0) {
        debug('pack errors', jsonStats.errors.toString());
      }
      debug('>> Doc capture package generated for ' + language);
      if (jsonStats.warnings.length > 0) {
        debug('pack warnings', jsonStats.warnings.toString());
      }
    });
  });
};
