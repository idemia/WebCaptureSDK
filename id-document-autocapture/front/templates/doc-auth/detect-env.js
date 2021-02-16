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
 * Environment detection using webDocserver librarie.
 */
/* global DocserverEnvironment, __ */
/**
 * Check user environment support
 * must be ES5 compatible
 **/
function displayEnvironement (env) {
  const envDetectionPage = document.querySelector('#step-compatibility');
  const descriptionClass = '.description';
  const stepCountrySelectionId = '#step-country-selection';
  if (env.envDetected) {
    const browsersDescription = envDetectionPage.querySelector('.browsers-description ');
    const envOS = env.envDetected.os;
    const envBrowser = env.envDetected.browser;
    if (!envOS.isSupported) {
      document.querySelector(stepCountrySelectionId).className = document.querySelector(stepCountrySelectionId).className.concat('d-none');
      envDetectionPage.className = envDetectionPage.className.replace('d-none', '');
      envDetectionPage.querySelector(descriptionClass).textContent = __('You seem to be using an unsupported operating system.');
      browsersDescription.textContent = __('Please use one of following operating systems for a better experience');
      const osList = envDetectionPage.querySelector('.os-list');
      osList.innerHTML = '';
      for (const osIndex in envOS.supportedList) {
        const osInfo = envOS.supportedList[osIndex];
        const os = document.createElement('div');
        os.className = 'os';
        const osImg = document.createElement('div');
        osImg.id = osInfo.toLowerCase().replace(' ', '-');
        osImg.className = 'os-img';
        const osDesc = document.createElement('span');
        osDesc.innerHTML = osInfo;
        os.appendChild(osImg);
        os.appendChild(osDesc);
        osList.appendChild(os);
      }
    } else if (!envBrowser.isSupported) {
      document.querySelector(stepCountrySelectionId).className = document.querySelector(stepCountrySelectionId).className.concat('d-none');
      envDetectionPage.className = envDetectionPage.className.replace('d-none', '');
      envDetectionPage.querySelector(descriptionClass).textContent = __('You seem to be using an unsupported browser.');
      browsersDescription.textContent = __('Please use one of following browsers for a better experience');
      const browsersList = envDetectionPage.querySelector('.browsers');
      browsersList.innerHTML = '';
      for (const browserIndex in envBrowser.supportedList) {
        const browserInfo = envBrowser.supportedList[browserIndex];
        const browser = document.createElement('div');
        browser.className = 'browser';
        const browserImg = document.createElement('div');
        browserImg.id = browserInfo.name.toLowerCase().replace(' ', '-');
        browserImg.className = 'browser-img';
        const browserDesc = document.createElement('span');
        browserDesc.innerHTML = browserInfo.name + ' Version ' + browserInfo.minimumVersion + '+';
        browser.appendChild(browserImg);
        browser.appendChild(browserDesc);
        browsersList.appendChild(browser);
      }
    } else {
      envDetectionPage.className = envDetectionPage.className.concat(' d-none');
      window.envBrowserOk = true;
      if (!envOS.isMobile) {
        document.querySelector('main').className = document.querySelector('main').className.concat(' pc');
      }
    }
  } else {
    envDetectionPage.querySelector(descriptionClass).textContent = env.message;
  }
}

/**
 * Check user env support
 * must be ES5 compatible
 **/
if (DocserverEnvironment) {
  DocserverEnvironment.detection(true, displayEnvironement);
}
