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

/**
 * Check user environement support
 * must be ES5 compatible
 **/
if (BioserverEnvironment) {
    var env = BioserverEnvironment.detection();
    var envDetectionPage = document.querySelector('#step-0');
    if (env.envDetected) {
        var browsersDescription = envDetectionPage.querySelector('.browsers-description ');
        var envOS = env.envDetected.os;
        var envBrowser = env.envDetected.browser;
        if (!envOS.isSupported) {
            envDetectionPage.className = envDetectionPage.className.replace('d-none', '');
            envDetectionPage.querySelector('.description').textContent = env.message;
            browsersDescription.textContent = "Please use one of following operating systems for a better experience";
            var osList = envDetectionPage.querySelector('.os-list');
            osList.innerHTML = "";
            for (var osIndex in envOS.supportedList) {
                var osInfo = envOS.supportedList[osIndex];
                var os = document.createElement('div');
                os.className = 'os';
                var osImg = document.createElement('div');
                osImg.id = osInfo.toLowerCase().replace(' ', '-');
                osImg.className = 'os-img';
                var osDesc = document.createElement('span');
                osDesc.innerHTML = osInfo;
                os.appendChild(osImg);
                os.appendChild(osDesc);
                osList.appendChild(os);
            }
        } else if (!envBrowser.isSupported) {
            envDetectionPage.className = envDetectionPage.className.replace('d-none', '');
            envDetectionPage.querySelector('.description').textContent = env.message;
            browsersDescription.textContent = "Please use one of following browsers for a better experience";
            var browsersList = envDetectionPage.querySelector('.browsers');
            browsersList.innerHTML = "";
            for (var browserIndex in envBrowser.supportedList) {
                var browserInfo = envBrowser.supportedList[browserIndex];
                var browser = document.createElement('div');
                browser.className = 'browser';
                var browserImg = document.createElement('div');
                browserImg.id = browserInfo.name.toLowerCase().replace(' ', '-');
                browserImg.className = 'browser-img';
                var browserDesc = document.createElement('span');
                browserDesc.innerHTML = browserInfo.name + ' Version ' + browserInfo.minimumVersion + '+';
                browser.appendChild(browserImg);
                browser.appendChild(browserDesc);
                browsersList.appendChild(browser);
            }
        } else {
            envDetectionPage.className = envDetectionPage.className.concat(' d-none');
            document.querySelector('#step-1').className = document.querySelector('#step-1').className.replace('d-none', '');
            if (!envOS.isMobile) {
                document.querySelector('main').className = document.querySelector('main').className.concat(' pc');
            }

        }
    } else {
        envDetectionPage.querySelector('.description').textContent = env.message;
    }
}