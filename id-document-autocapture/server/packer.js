/*
Copyright 2021 Idemia Identity & Security

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
const logger = require('./config/demoLogConf').getLogger();
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const I18nPlugin = require('@zainulbr/i18n-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const languages = { en: null };

config.SUPPORTED_LANGUAGES.split(',').forEach(lang => {
    try {
        if (lang !== 'en') {
            languages[lang] = require(`./config/i18n/${lang}.json`);
        }
    } catch (err) {
        logger.warn('Warning! No %s.json found, fallback to english for this language %s', lang);
    }
});

exports.pack = function pack() {
    const mode = process.env.NODE_ENV === 'development' ? 'development' : 'production';
    const devtool = process.env.NODE_ENV === 'development' ? 'source-map' : false;
    const templatesPath = '../front/templates/doc-auth';
    const watch = mode === 'development'; // << watch changes only on dev env
    const watchOptions = {
        aggregateTimeout: 500, // allow few time to packer to aggregate changes during this time
        poll: 1000 // Check for changes every second
    };
    logger.info('>> NODE_ENV: %s => %o', process.env.NODE_ENV, { mode, devtool, watch });

    Object.keys(languages).forEach(language => {
        logger.info(`Generating ${language} package ...`);
        webpack({
            name: language,
            context: __dirname,
            entry: {
                index: `${templatesPath}/index.js`,
                'detect-env': `${templatesPath}/detect-env.js`
            },
            mode,
            devtool,
            watch,
            watchOptions,
            // this will increase default maxSize from default one 244kB to 550kB because of gif animation files
            performance: { maxEntrypointSize: 570 * 1024, maxAssetSize: 570 * 1024 },
            output: {
                path: path.join(__dirname, '../front/doc-auth/' + language + '/js/'),
                publicPath: 'js',
                filename: '[name].js',
                hashFunction: 'sha256'
            },
            plugins: [
                new CleanWebpackPlugin(),
                new I18nPlugin(languages[language], { failOnMissing: true }),
                new HtmlWebpackPlugin({
                    inject: false,
                    filename: '../index.html', // relative to thisObj.output.path
                    template: `${templatesPath}/index.html`
                }),
                new webpack.DefinePlugin({
                    BASE_PATH: JSON.stringify(config.BASE_PATH),
                    DOCSERVER_VIDEO_URL_WITH_BASE_PATH: JSON.stringify(config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH),
                    DOCSERVER_VIDEO_URL: JSON.stringify(config.DOCSERVER_VIDEO_URL),
                    DOC_SERVER_BASE_PATH: JSON.stringify(config.DOC_SERVER_BASE_PATH),
                    DISABLE_CALLBACK: JSON.stringify(config.DISABLE_CALLBACK),
                    IDPROOFING: JSON.stringify(config.IDPROOFING)
                }),
                new CopyPlugin({
                    patterns: [
                        {
                            from: `${templatesPath}/statics/`,
                            to: path.join(__dirname, '../front/doc-auth/' + language)
                        }
                    ]
                })
            ]
        }, (err, stats) => {
            if (err) {
                logger.error('Failed to pack assets with error', err);
                return;
            }
            const jsonStats = stats.toJson();
            if (jsonStats.errors.length > 0) {
                logger.error(`[${language}] - pack finished with error %o`, jsonStats.errors);
            } else if (jsonStats.warnings.length > 0) {
                logger.warn(`[${language}] - pack finished with warnings %o`, jsonStats.warnings);
            } else {
                logger.info(`[${language}] - pack finished`);
            }
        });
    });
};
