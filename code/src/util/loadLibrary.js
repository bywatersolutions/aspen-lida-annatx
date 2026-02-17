import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'apisauce';
import _ from 'lodash';
import React from 'react';

// custom components and helper files
import { popToast } from '../components/loadError';
import { getTermFromDictionary } from '../translations/TranslationService';
import { createAuthTokens, getErrorMessage, getHeaders, postData } from './apiAuth';
import { GLOBALS } from './globals';
import { PATRON } from './loadPatron';
import { RemoveData } from './logout';

import { logDebugMessage, logInfoMessage, logWarnMessage, logErrorMessage } from '../util/logging.js';

export const LIBRARY = {
     url: '',
     name: '',
     favicon: '',
     languages: [],
     vdx: [],
     localIll: [],
     id: 0,
     version: null,
};

export const BRANCH = {
     name: '',
     vdxFormId: null,
     vdxLocation: null,
     vdx: [],
     localIllFormId: null,
};

export const ALL_LOCATIONS = {
     branches: [],
};

export const ALL_BRANCHES = {};

/**
 * Fetch settings for app that are maintained by the library
 **/
export async function getAppSettings(url, timeout, slug) {
     logDebugMessage("Getting App Settings from url: " + url + " slug: " + slug);
     try {
          const api = create({
               baseURL: url + '/API',
               timeout,
               headers: getHeaders(),
               auth: createAuthTokens(),
          });
          const response = await api.get('/SystemAPI?method=getAppSettings', {
               slug
          });
          if (response !== undefined && response.ok) {
               LIBRARY.appSettings = response.data?.result?.settings ?? [];
               return response.data?.result?.settings ?? [];
          } else {
               logWarnMessage("Did not get valid response from getAppSettings url: " + url + " slug: " + slug);
               if (response === undefined) {
                    logWarnMessage("Response was undefined :(");
               }else{
                    logWarnMessage(response);
               }
               const error = getErrorMessage({ statusCode: response.status, problem: response.problem, sendToSentry: true });
               popToast(error.title, error.message, 'error');
               return [];
          }
     }catch (err) {
          popToast(getTermFromDictionary('en', 'error_no_server_connection'), "Could not retrieve App Settings, please try again later.", 'error');
          logErrorMessage("Exception in getAppSettings " + err);
          return [];
     }
}

/**
 * Fetch valid pickup locations for the patron
 **/
export async function getPickupLocations(url = null, groupedWorkId = null, recordId = null) {
     let baseUrl = url ?? LIBRARY.url;
     const postBody = await postData();
     const api = create({
          baseURL: baseUrl + '/API',
          timeout: GLOBALS.timeoutAverage,
          headers: getHeaders(true),
          auth: createAuthTokens(),
          params: {
               groupedWorkId,
               recordId,
          }
     });
     return await api.post('/UserAPI?method=getValidPickupLocations', postBody);
}

export function formatPickupLocations(data) {
     let locations = [];
     const tmp = data.pickupLocations;
     if (_.isObject(tmp) || _.isArray(tmp)) {
          locations = tmp.map(({ displayName, code, locationId }) => ({
               key: locationId,
               locationId,
               code,
               name: displayName,
          }));
     }
     PATRON.pickupLocations = locations;
     data.locations = locations;
     return data;
}

export async function getPickupSublocations(url = null) {
     let sublocations = [];
     let baseUrl = url ?? LIBRARY.url;
     const postBody = await postData();
     const api = create({
          baseURL: baseUrl + '/API',
          timeout: GLOBALS.timeoutAverage,
          headers: getHeaders(true),
          auth: createAuthTokens()
     });
     const response = await api.post('/UserAPI?method=getValidSublocations', postBody);

     if (response.ok) {
          if (response.data.result.success) {
               const data = response.data.result.sublocations;

               if (_.isObject(data) || _.isArray(data)) {
                    sublocations = data;
               }else{
                    sublocations = [];
               }

               PATRON.sublocations = sublocations;
               return sublocations;
          }else{
               logDebugMessage("Call to get sublocations did not succeed");
               logErrorMessage(response);
          }
     } else {
          const error = getErrorMessage({ statusCode: response.status, problem: response.problem, sendToSentry: true });
          popToast(error.title, error.message, 'error');
          logDebugMessage(response);
     }

     PATRON.sublocations = sublocations;
     return sublocations;
}

export async function getVdxForm(url, id) {
     const postBody = await postData();
     const api = create({
          baseURL: url + '/API',
          timeout: GLOBALS.timeoutAverage,
          headers: getHeaders(true),
          auth: createAuthTokens(),
          params: { formId: id },
     });
     const response = await api.post('/SystemAPI?method=getVdxForm', postBody);
     if (response.ok) {
          LIBRARY.vdx = response.data.result;
          return response.data.result;
     } else {
          const error = getErrorMessage({ statusCode: response.status, problem: response.problem, sendToSentry: true });
          popToast(error.title, error.message, 'error');
          logDebugMessage(response);
     }
}

export async function getLocalIllForm(url, id) {
     const postBody = await postData();
     const api = create({
          baseURL: url + '/API',
          timeout: GLOBALS.timeoutAverage,
          headers: getHeaders(true),
          auth: createAuthTokens(),
          params: { formId: id },
     });
     const response = await api.post('/SystemAPI?method=getLocalIllForm', postBody);
     if (response.ok) {
          LIBRARY.localIll = response.data.result;
     }
     return response;
}

export function formatDiscoveryVersion(payload) {
     if (payload === undefined) {
          // skip trying to parse the version if it is undefined
          logWarnMessage('Could not load discovery version, the version was undefined. Something is wrong.');
          return LIBRARY.version ?? 'Unknown';
     }
     try {
          const result = payload.split(' ');
          if (_.isObject(result)) {
               if (LIBRARY.version !== result[0]) {
                    logInfoMessage('Updated LIBRARY.version to ' + result[0]);
                    LIBRARY.version = result[0];
                    return result[0];
               }
          }
     } catch (e) {
          logErrorMessage(e);
     }
     return LIBRARY.version ?? 'Unknown'; // if we couldn't parse the version (??), return the currently stored version or unknown
}

/**
 * Fetch home screen feed items for the library
 **/
export async function getHomeScreenFeed(maxCat = 5, url = null) {
     let maxCategories = maxCat ?? 5;
     const postBody = await postData();
     let discovery;
     let baseUrl = url ?? LIBRARY.url;
     if (maxCategories !== 9999) {
          discovery = create({
               baseURL: baseUrl + '/API',
               timeout: GLOBALS.timeoutAverage,
               headers: getHeaders(true),
               auth: createAuthTokens(),
               params: {
                    maxCategories: maxCategories,
                    LiDARequest: true,
               },
          });
     } else {
          discovery = create({
               baseURL: baseUrl + '/API',
               timeout: GLOBALS.timeoutAverage,
               headers: getHeaders(true),
               auth: createAuthTokens(),
               params: {
                    LiDARequest: true,
               },
          });
     }
     return await discovery.post('/SearchAPI?method=getHomeScreenFeed', postBody);
}
