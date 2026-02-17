import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { useNavigation } from '@react-navigation/native';

// custom components and helper files
import { LOGIN_DATA, GLOBALS } from './globals';
import { LIBRARY } from './loadLibrary';
import { PATRON } from './loadPatron';
import { BrowseCategoryContext, LibraryBranchContext, LibrarySystemContext, UserContext } from '../context/initialContext';
import { logDebugMessage, logInfoMessage, logWarnMessage, logErrorMessage } from './logging.js';
/**
 * Logout the user and clean up data
 **/
export async function RemoveData(queryClient, updateUser) {
     try {
          logDebugMessage("Removing Data in secure storage");
          SecureStore.deleteItemAsync('patronName');
          SecureStore.deleteItemAsync('library');
          SecureStore.deleteItemAsync('libraryName');
          SecureStore.deleteItemAsync('locationId');
          SecureStore.deleteItemAsync('solrScope');
          SecureStore.deleteItemAsync('pathUrl');
          SecureStore.deleteItemAsync('version');
          SecureStore.deleteItemAsync('userKey');
          SecureStore.deleteItemAsync('secretKey');
          SecureStore.deleteItemAsync('userToken');
          SecureStore.deleteItemAsync('logo');
          SecureStore.deleteItemAsync('favicon');
          logDebugMessage("Removing Data in async storage");
          await AsyncStorage.removeItem('@userToken');
          await AsyncStorage.removeItem('@patronProfile');
          await AsyncStorage.removeItem('@libraryInfo');
          await AsyncStorage.removeItem('@locationInfo');
          await AsyncStorage.removeItem('@pathUrl');
          logDebugMessage("Invalidating Queries");
     } catch (e) {
          logErrorMessage("Error clearing storage");
          logErrorMessage(e);
     }

     logDebugMessage("Clearing Context information");
     LIBRARY.url = null;
     LIBRARY.name = null;
     LIBRARY.favicon = null;
     LIBRARY.version = GLOBALS.appVersion;
     LIBRARY.languages = [];
     LIBRARY.vdx = [];
     LIBRARY.localIll = [];
     PATRON.userToken = null;
     PATRON.scope = null;
     PATRON.library = null;
     PATRON.location = null;
     PATRON.listLastUsed = null;
     PATRON.fines = 0;
     PATRON.messages = [];
     PATRON.num.checkedOut = 0;
     PATRON.num.holds = 0;
     PATRON.num.lists = 0;
     PATRON.num.overdue = 0;
     PATRON.num.ready = 0;
     PATRON.num.savedSearches = 0;
     PATRON.num.updatedSearches = 0;
     PATRON.promptForOverdriveEmail = 1;
     PATRON.rememberHoldPickupLocation = 0;
     PATRON.pickupLocations = [];
     PATRON.sublocations = [];
     PATRON.language = 'en';
     PATRON.hideSoftDeleteListUI = false;
     PATRON.coords.lat = 0;
     PATRON.coords.long = 0;
     PATRON.linkedAccounts = [];
     PATRON.holds = [];
     PATRON.checkouts = [];
     LOGIN_DATA.showSelectLibrary = true;
     LOGIN_DATA.runGreenhouse = true;
     LOGIN_DATA.num = 0;
     LOGIN_DATA.nearbyLocations = [];
     LOGIN_DATA.allLocations = [];
     LOGIN_DATA.hasPendingChanges = false;
     LOGIN_DATA.loadedInitialData = false;
     LOGIN_DATA.themeSaved = false;

     try {
          if (queryClient !== null) {
               queryClient.invalidateQueries();
               logDebugMessage("Invalidated all queries");
          }
     } catch (e) {
          logErrorMessage("Error invalidating all queries");
          logErrorMessage(e);
     }
     try {
          if (updateUser !== null) {
               updateUser({});
          }
     } catch (e) {
          logErrorMessage("Error clearing user");
          logErrorMessage(e);
     }

     logDebugMessage('Storage data cleansed.');
}
