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
 * retrieve monitoring informations
 */
exports.getMonitoring = async function (basePath, healthPath)  {

  return new Promise(function (resolve, reject) {
    console.log(' >> get monitoring', healthPath);

    const xhttp = new window.XMLHttpRequest();
    xhttp.open('GET', basePath + healthPath, true);
    xhttp.setRequestHeader('Content-type', 'application/json');

    xhttp.responseType = 'json';
    xhttp.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        console.log('getMonitoring ok', xhttp.response);
        resolve(xhttp.response)
      } else {
        console.error('getMonitoring failed');
        reject('getMonitoring failed');
      }

    };
    xhttp.onerror = function () {
      console.log('Error ' + httpError.status + '  ' + httpError.code);
      reject(httpError);

    };
    xhttp.send()
  })
};
