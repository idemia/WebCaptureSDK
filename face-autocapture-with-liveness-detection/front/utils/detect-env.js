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

/* global BioserverEnvironment, __ */
/* eslint-disable no-console */

if (typeof BioserverEnvironment === 'object') {
    var env = BioserverEnvironment.detection();
    var envDetectionPage = document.querySelector('#step-compatibility');
    var description = envDetectionPage.querySelector('.description');
    if (env.envDetected) {
        var browsersDescription = envDetectionPage.querySelector('.browsers-description ');
        var envOS = env.envDetected.os;
        var envBrowser = env.envDetected.browser;
        if (!envOS.isSupported) {
            envDetectionPage.className = envDetectionPage.className.replace('d-none', '');
            description.textContent = __('You seem to be using an unsupported operating system.');
            browsersDescription.textContent = __('Please use one of following operating systems for a better experience');
            var osList = envDetectionPage.querySelector('.os-list');
            osList.innerHTML = '';
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
            description.textContent = __('You seem to be using an unsupported browser.');
            browsersDescription.textContent = __('Please use one of following browsers for a better experience');
            var browsersTable = envDetectionPage.querySelector('.browsers');
            browsersTable.innerHTML = '';
            for (var browserIndex in envBrowser.supportedList) {
                var browserInfo = envBrowser.supportedList[browserIndex];
                var browserName = browserInfo.name.toLowerCase().replace(' ', '-');

                // logo image td part
                var imgLogo = document.createElement('img');
                imgLogo.src = './img/browsers/' + browserName + '.png';
                imgLogo.className = 'browser-logo';
                var tdLogo = document.createElement('td');
                tdLogo.appendChild(imgLogo);

                // description td part
                var tdDesc = document.createElement('td');
                var browserDesc = document.createElement('span');
                browserDesc.innerHTML = browserInfo.name + ' Version ' + browserInfo.minimumVersion + '+';
                browserDesc.className = 'marginLeft10';
                tdDesc.appendChild(browserDesc);

                // varruct each tr with previous tds
                var trElement = document.createElement('tr');
                trElement.appendChild(tdLogo);
                trElement.appendChild(tdDesc);
                browsersTable.appendChild(trElement);
            }
        } else {
            envDetectionPage.className = envDetectionPage.className.concat(' d-none');
            window.envBrowserOk = true;
            if (!envOS.isMobile) {
                document.querySelector('main').className = document.querySelector('main').className.concat(' pc');
            }
        }
    } else {
        description.textContent = env.message;
    }
} else {
    console.warn('Failed to detect environment compatibility, no api found!');
}
