'use strict';
const angular = require('angular');
const app = angular.module('app');
const urlParse = require('url').parse;
const {flatten} = require('lodash');
const throat = require('throat');
let {baseFetch} = require('./apiQueues');
const {FormData,wrapBuffer} = require('../common/fetch');

app.factory('organizerUpload', organizerUpload);

organizerUpload.$inject = ['apiQueues'];

const localHostnames = new Set([
  'localhost'
]);

baseFetch = throat(3, baseFetch);

function organizerUpload(apiQueues) {
  function _request(options) {
    let url = options.url;
    if (url[0] === '/' && options.instance) {
      // this removes port when instance is something like localhost:8080
      const hostname = urlParse('test://' + options.instance).hostname;
      const scheme = localHostnames.has(hostname) ? 'http' : 'https';
      url = `${scheme}://${options.instance}/api${options.url}`;
    }
    return baseFetch({
      options: Object.assign({}, options, {
        url,
        headers: Object.assign({
          'Authorization':  'scitran-user ' + options.apiKey
        }, options.headers)
      })
    });
  }

  const service = {
    upload: upload,
    testcall: testcall,
    loadGroups: loadGroups,
    loadProjects: loadProjects,
    loadAcquisitions
  };
  return service;
  function testcall(instance) {
    var options = {
      url: `https://${instance}:8443/api`,
      agentOptions: {
        rejectUnauthorized: false
      }
    };
    return apiQueues.append({options: options});
  }
  function loadGroups(instance, apiKey, root){
    return _request({
      method: 'GET',
      instance,
      apiKey,
      url: `/groups?root=${root||false}`
    });
  }
  function loadProjects(instance, apiKey, group, root){
    return _request({
      method: 'GET',
      instance,
      apiKey,
      url: `/groups/${group}/projects?root=${root||false}`
    });
  }
  function upload(instance, files, metadata, apiKey, root) {
    const body = new FormData();
    body.append('metadata', metadata);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      body.append('file' + i, wrapBuffer(f.content), f.name);
    }
    return _request({
      method: 'POST',
      instance,
      apiKey,
      url: `/upload/uid?root=${root||false}`,
      throwForStatus: true,
      body: body
    });
  }
  function loadAcquisitions(instance, apiKey, groupName, projectLabel) {
    function requestJSON(url) {
      return _request({ instance, apiKey, url }).then(body => JSON.parse(body));
    }

    return requestJSON(`/groups`).then((groups) => {
      const group = groups.find(g => g.name === groupName);
      return requestJSON(`/groups/${group._id}/projects`);
    }).then((projects) => {
      const project = projects.find(p => p.label === projectLabel);
      return requestJSON(`/projects/${project._id}/sessions`);
    }).then((sessions) => {
      const promises = sessions.map(session =>
        requestJSON(`/sessions/${session._id}/acquisitions`).then(acquisitions => {
          // a bit of a hack here: we attach the session to the acquisition, just like the
          // elastic search response body we used to get.
          for (const a of acquisitions) {
            a.session = session;
          }
          return acquisitions;
        })
      );
      return Promise.all(promises).then(result => flatten(result));
    })
  }
}
