'use strict';
const angular = require('angular');
const app = angular.module('app');
const urlParse = require('url').parse;

app.factory('organizerUpload', organizerUpload);

organizerUpload.$inject = ['apiQueues'];

const localHostnames = new Set([
  'localhost'
]);

function organizerUpload(apiQueues) {
  function _request(options) {
    let url = options.url;
    if (url[0] === '/' && options.instance) {
      // this removes port when instance is something like localhost:8080
      const hostname = urlParse('test://' + options.instance).hostname;
      const scheme = localHostnames.has(hostname) ? 'http' : 'https';
      url = `${scheme}://${options.instance}/api${options.url}`;
    }
    return apiQueues.append({
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
      body.append('file' + i, new Blob([f.content]), f.name);
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
    const body = {
      groups: {filtered: {filter: {query: {match: {name: groupName}}}}},
      projects: {filtered: {filter: {query: {match: {label: projectLabel}}}}},
      path: 'acquisitions'
    };
    return _request({
      method: 'POST',
      instance,
      apiKey,
      url: `/search`,
      body: body,
      json: true
    }).then(function({acquisitions}) {
      // we throw out the search result wrapper ES gives us to avoid futzing with _source
      return acquisitions.map(a => a._source);
    });
  }
}
