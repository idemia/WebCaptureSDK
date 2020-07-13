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

// This file allow you to pack your sample app according to your security level

const path = require('path');
const config = require('./config');
const debug = require('debug')('front:packer');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const I18nPlugin = require("i18n-webpack-plugin");
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const languages = {en: null};

config.SUPPORTED_LANGUAGES.split(',').forEach(lang => {
    try{
        if (lang!== 'en') languages[lang] =  require(`./config/i18n/${lang}.json`);
    } catch(err) {
        debug(`Warning! No ${lang}.json found, fallback to english for this language`);
    }
});


// generate liveness package by mode

exports.pack = function pack() {
    const mode = process.env.NODE_ENV ? 'production' : 'development';
    const devtool = process.env.NODE_ENV ? false : 'source-map';
    console.log('>> process.env.NODE_ENV = ', process.env.NODE_ENV, {mode}, {devtool});
    // generate liveness high package
    if(config.LIVENESS_MODE=== "LIVENESS_HIGH") {
        Object.keys(languages).map(function (language) {
            debug(`Generating ${language} package ...`);
            webpack({
                mode: mode,
                name: language,
                context: __dirname,
                entry: {
                    "index": "../front/templates/high-liveness/index.js",
                    "detect-env": "../front/templates/high-liveness/detect-env.js"
                },
                devtool: devtool,
                output: {
                    path: path.join(__dirname, `../front/high-liveness/${language}/js/`),
                    publicPath: 'js',
                    filename: `[name].js`
                },
                plugins: [
                    new CleanWebpackPlugin(),
                    new I18nPlugin(languages[language], {failOnMissing: true}),
                    new HtmlWebpackPlugin({
                        inject: false,
                        filename: `../index.html`, // relative to thisObj.output.path
                        template: '../front/templates/high-liveness/index.html'
                    }),
                    new webpack.DefinePlugin({
                        'BASE_PATH': JSON.stringify(config.BASE_PATH),
                        'VIDEO_URL': JSON.stringify(config.BIOSERVER_VIDEO_URL),
                        'VIDEO_BASE_PATH': JSON.stringify(config.VIDEO_SERVER_BASE_PATH),
                        'JAVASCRIPT_PATH': !config.USE_INTERNAL_PROXY ? JSON.stringify(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH) : JSON.stringify(".."),
                        'DISABLE_CALLBACK': JSON.stringify(config.DISABLE_CALLBACK),
                        'USE_INTERNAL_PROXY': config.USE_INTERNAL_PROXY
                    }),
                    new CopyPlugin([
                        {
                            from: '../front/templates/high-liveness/statics/',
                            to: path.join(__dirname, `../front/high-liveness/${language}/`)
                        }
                    ])
                ]
            }).watch({poll: 1000}, (err, stats) => {
                if (err) {
                    throw err
                }
                const jsonStats = stats.toJson()
                if (jsonStats.errors.length > 0) {
                    console.log('pack errors', jsonStats.errors.toString())
                }
                debug(`>> ${language} package generated`);
                if (jsonStats.warnings.length > 0) {
                    console.log('pack warnings', jsonStats.warnings.toString())
                }
            })
        });
    }
	// generate liveness medium package
    if(config.LIVENESS_MODE=== "LIVENESS_MEDIUM") {
        webpack({
            mode: mode,
            name: 'medium-liveness-package',
            context: __dirname,
            entry: {
                "index": "../front/templates/medium-liveness/index.js",
                "detect-env": "../front/templates/medium-liveness/detect-env.js"
            },
            devtool: devtool,
            output: {

                path: path.join(__dirname, `../front/medium-liveness/js/`),
                publicPath: 'js',
                filename: `[name].js`
            },
            plugins: [
                new HtmlWebpackPlugin({
                    inject: false,
                    filename: `../index.html`, // relative to thisObj.output.path
                    template: '../front/templates/medium-liveness/index.html'
                }),
                new webpack.DefinePlugin({
                    'BASE_PATH': JSON.stringify(config.BASE_PATH),
                    'VIDEO_URL': JSON.stringify(config.BIOSERVER_VIDEO_URL),
                    'VIDEO_BASE_PATH': JSON.stringify(config.VIDEO_SERVER_BASE_PATH),
                    'JAVASCRIPT_PATH': !config.USE_INTERNAL_PROXY ? JSON.stringify(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH) : JSON.stringify(".."),
                    'DISABLE_CALLBACK': JSON.stringify(config.DISABLE_CALLBACK),
                    'USE_INTERNAL_PROXY': config.USE_INTERNAL_PROXY
                }),
                new CopyPlugin([
                  {
                      from: '../front/templates/medium-liveness/statics/',
                      to: path.join(__dirname, `../front/medium-liveness/`)
                  }
                ])
            ]
        }).watch({poll: 1000}, (err, stats) => {
            if (err) {
                throw err
            }
            const jsonStats = stats.toJson()
            if (jsonStats.errors.length > 0) {
                console.log('pack errors', jsonStats.errors.toString())
            }
            debug(`>> medium liveness package generated`);
            if (jsonStats.warnings.length > 0) {
                console.log('pack warnings', jsonStats.warnings.toString())
            }
        });
    }
	// generate passive liveness package
    if(config.LIVENESS_MODE=== "LIVENESS_PASSIVE") {
        Object.keys(languages).map(function (language) {
            debug(`Generating ${language} package ...`);
            webpack({
                mode: mode,
                name: language,
                context: __dirname,
                entry: {
                    "index": "../front/templates/passive-liveness/index.js",
                    "detect-env": "../front/templates/passive-liveness/detect-env.js"
                },
                devtool: devtool,
                output: {

                    path: path.join(__dirname, `../front/passive-liveness/${language}/js/`),
                    publicPath: 'js',
                    filename: `[name].js`
                },
                plugins: [
                    new CleanWebpackPlugin(),
                    new I18nPlugin(languages[language], {failOnMissing: true}),
                    new HtmlWebpackPlugin({
                        inject: false,
                        filename: `../index.html`, // relative to thisObj.output.path
                        template: '../front/templates/passive-liveness/index.html'
                    }),
                    new webpack.DefinePlugin({
                        'BASE_PATH': JSON.stringify(config.BASE_PATH),
                        'VIDEO_URL': JSON.stringify(config.BIOSERVER_VIDEO_URL),
                        'VIDEO_BASE_PATH': JSON.stringify(config.VIDEO_SERVER_BASE_PATH),
                        'JAVASCRIPT_PATH': !config.USE_INTERNAL_PROXY ? JSON.stringify(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH) : JSON.stringify(".."),
                        'DISABLE_CALLBACK': JSON.stringify(config.DISABLE_CALLBACK),
                        'USE_INTERNAL_PROXY': config.USE_INTERNAL_PROXY,
                        'VIDEO_HEALTH_PATH': JSON.stringify(config.VIDEO_HEALTH_PATH)
                    }),
                    new CopyPlugin([
                        {
                            from: '../front/templates/passive-liveness/statics/',
                            to: path.join(__dirname, `../front/passive-liveness/${language}/`)
                        }
                    ])
                ]
            }).watch({poll: 1000}, (err, stats) => {
                if (err) {
                    throw err
                }
                const jsonStats = stats.toJson()
                if (jsonStats.errors.length > 0) {
                    console.log('pack errors', jsonStats.errors.toString())
                }

                if (jsonStats.warnings.length > 0) {
                    console.log('pack warnings', jsonStats.warnings.toString())
                }
                debug(`>> passive liveness package generated for  `, language);
            });
        });
    }
}
