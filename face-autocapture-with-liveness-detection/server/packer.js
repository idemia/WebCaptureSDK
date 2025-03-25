/*
Copyright 2025 IDEMIA Public Security
Copyright 2020-2024 IDEMIA Identity & Security

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

// This file allow you to pack your sample app according to your security level

const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const I18nPlugin = require('@zainulbr/i18n-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const languages = { en: null };
const MODE = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const HtmlReplaceWebpackPlugin = require('html-replace-webpack-plugin');
const DEVTOOL = process.env.NODE_ENV === 'production' ? false : 'source-map';

const DETECT_ENV_PATH = '../front/utils/detect-env.js';
const TEMPLATES_PATH = '../front/templates/';
const OUTPUT_ROOT_PATH = '../front/dist/';

const PACK_ERRORS = 'pack errors';
const PACK_WARNINGS = 'pack warnings';

config.SUPPORTED_LANGUAGES.split(',').forEach(lang => {
    try {
        if (lang !== 'en') {
            languages[lang] = require(`./config/i18n/${lang}.json`);
        }
    } catch (err) {
        logger.warn(`No ${lang}.json found, fallback to english for this language`);
    }
});

// generate liveness package by mode

exports.pack = function pack() {
    logger.info('>> process.env.NODE_ENV = ', process.env.NODE_ENV, { mode: MODE }, { devtool: DEVTOOL });
    // Cleanup dist dir before packing
    fs.rmSync(path.join(__dirname, OUTPUT_ROOT_PATH), { recursive: true, force: true });
    // generate active liveness package
    if (config.LIVENESS_MODE === 'LIVENESS_ACTIVE') {
        livenessPackage('active');
    } else if (config.LIVENESS_MODE === 'LIVENESS_PASSIVE') {
        livenessPackage('passive');
    } else if (config.LIVENESS_MODE === 'LIVENESS_PASSIVE_VIDEO') {
        livenessPackage('passive-video');
    } 
};

function livenessPackage(liveness) {
    Object.keys(languages).forEach(function (language) {
        logger.info(`Generating ${language} package...`);
        // eslint-disable-next-line no-unused-expressions
        webpack({
            mode: MODE,
            name: language,
            context: __dirname,
            entry: {
                index: path.join(__dirname, TEMPLATES_PATH, `${liveness}-liveness/index.js`),
                'detect-env': path.join(__dirname, DETECT_ENV_PATH)
            },
            devtool: DEVTOOL,
            optimization: {
                minimize: MODE === 'production'
            },
            output: {
                path: path.join(__dirname, OUTPUT_ROOT_PATH, `${liveness}-liveness/${language}/js/`),
                publicPath: 'js',
                filename: '[name].js',
                hashFunction: 'sha256'
            },
            target: ['web', 'es5'],
            module: {
                rules: [
                    {
                        test: /detect-env.js$/,
                        exclude: /node_modules/,
                        use: {
                            loader: 'babel-loader',
                            options: {
                                presets: ['@babel/preset-env']
                            }
                        }
                    }
                ]
            },
            plugins: [
                new I18nPlugin(languages[language], { failOnMissing: true }),
                new HtmlWebpackPlugin({
                    inject: false,
                    filename: path.join(__dirname, OUTPUT_ROOT_PATH, `${liveness}-liveness/${language}/index.html`),
                    template: path.join(__dirname, TEMPLATES_PATH, `${liveness}-liveness/index.html`)
                }),
                new HtmlWebpackPlugin({
                    inject: false,
                    filename: path.join(__dirname, OUTPUT_ROOT_PATH, `home-${liveness}/index.html`),
                    template: path.join(__dirname, TEMPLATES_PATH, `${liveness}-liveness/home.html`)
                }),
                new HtmlReplaceWebpackPlugin(
                    [
                        {
                            pattern: config.IDPROOFING ? /<li><a href=".\/active-liveness\/\?enableMatching=true">Active liveness with matching<\/a><\/li>/ : '',
                            replacement: ''
                        },
                        {
                            pattern: config.IDPROOFING ? /<li><a href=".\/passive-liveness\/\?enableMatching=true">Passive liveness with matching<\/a><\/li>/ : '',
                            replacement: ''
                        },
                        {
                            pattern: config.IDPROOFING ? /<li><a href=".\/passive-video-liveness\/\?enableMatching=true">Passive video liveness with matching<\/a><\/li>/ : '',
                            replacement: ''
                        }
                    ]
                ),
                new webpack.DefinePlugin({
                    BASE_PATH: JSON.stringify(config.BASE_PATH),
                    VIDEO_URL: JSON.stringify(config.BIOSERVER_VIDEO_URL),
                    VIDEO_BASE_PATH: JSON.stringify(config.VIDEO_SERVER_BASE_PATH),
                    JAVASCRIPT_PATH: JSON.stringify(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH),
                    DISABLE_CALLBACK: JSON.stringify(config.DISABLE_CALLBACK),
                    DEMO_HEALTH_PATH: JSON.stringify(config.DEMO_HEALTH_PATH),
                    IDPROOFING: JSON.stringify(config.IDPROOFING)
                }),
                new CopyPlugin(
                    {
                        patterns: [
                            {
                                from: path.join(__dirname, TEMPLATES_PATH, `${liveness}-liveness/statics/`),
                                to: path.join(__dirname, OUTPUT_ROOT_PATH, `${liveness}-liveness/${language}/`)
                            }
                        ]
                    }
                )
            ]
        }, (err, stats) => {
            if (err) {
                logger.error('Failed to pack assets with error', err);
                return;
            }
            const jsonStats = stats.toJson();
            if (jsonStats.errors.length > 0) {
                logger.error(PACK_ERRORS, jsonStats.errors);
            }
            if (jsonStats.warnings.length > 0) {
                logger.warn(PACK_WARNINGS, jsonStats.warnings);
            }
            logger.info(`>> ${liveness} liveness package generated for ${language}`);
        });
    });
}


