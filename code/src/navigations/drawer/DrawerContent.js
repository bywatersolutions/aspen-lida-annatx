import NetInfo from '@react-native-community/netinfo';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useFocusEffect, useLinkTo } from '@react-navigation/native';
import { useQuery, useQueryClient, onlineManager, focusManager } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import _, { values } from 'lodash';
import { Badge, Box, Button, Container, Divider, HStack, Icon, Image, Pressable, Text, useColorModeValue, useToken, VStack } from 'native-base';
import React from 'react';
import navigation, { AuthContext } from '../../components/navigation';
import { AppState, Platform, View } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { AppStateStatus } from "react-native";

// custom components and helper files
import { showILSMessage } from '../../components/Notifications';
import { BrowseCategoryContext, CheckoutsContext, HoldsContext, LanguageContext, LibraryBranchContext, LibrarySystemContext, SystemMessagesContext, UserContext } from '../../context/initialContext';
import { navigateAndSimpleReset, navigateStack } from '../../helpers/RootNavigator';
import { CatalogOffline } from '../../screens/Auth/CatalogOffline';
import { InvalidCredentials } from '../../screens/Auth/InvalidCredentials';
import { UseColorMode } from '../../themes/theme';
import { getTermFromDictionary, getTranslationsWithValues, LanguageSwitcher } from '../../translations/TranslationService';
import { fetchSavedEvents } from '../../util/api/event';
import { getCatalogStatus } from '../../util/api/library';
import { formatLists, getListGroups, getLists } from '../../util/api/list';
import { getLocations } from '../../util/api/location';
import { fetchNotificationHistory, fetchSavedSearches, getLinkedAccounts, getPatronCheckedOutItems, sortCheckouts, getPatronHolds, sortHolds, getViewerAccounts, refreshProfile, reloadProfile, revalidateUser, validateSession, formatNotificationHistory, formatLinkedAccounts, formatHolds } from '../../util/api/user';
import { getErrorMessage, passUserToDiscovery, stripHTML } from '../../util/apiAuth';
import { GLOBALS } from '../../util/globals';
import { formatDiscoveryVersion, formatPickupLocations, getHomeScreenFeed, getPickupLocations } from '../../util/loadLibrary';
import { getBrowseCategoryListForUser, getILSMessages, PATRON } from '../../util/loadPatron';

import { logDebugMessage, logInfoMessage, logWarnMessage, logErrorMessage } from '../../util/logging.js';
import * as Sentry from '@sentry/react-native';

Notifications.setNotificationHandler({
     handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
     }),
});

onlineManager.setEventListener(setOnline => {
     return NetInfo.addEventListener(state => {
          setOnline(!!state.isConnected)
     })
})

function onAppStateChange(AppStateStatus) {
     if (Platform.OS !== 'web') {
          focusManager.setFocused(AppStateStatus === 'active')
     }
}

const prefix = Linking.createURL('/');

export const DrawerContent = () => {
     const [userLatitude, setUserLatitude] = React.useState(0);
     const [userLongitude, setUserLongitude] = React.useState(0);
     const linkTo = useLinkTo();
     const queryClient = useQueryClient();
     const insets = useSafeAreaInsets();
     const { user, accounts, viewers, cards, lists, updateUser, updateLanguage, updatePickupLocations, updateLinkedAccounts, updatePreferredPickupLocationIsValid, updatePreferredPickupLocationWarning, updateLists, updateSavedEvents, updateLibraryCards, updateLinkedViewerAccounts, updateReadingHistory, notificationSettings, expoToken, updateNotificationOnboard, notificationOnboard, notificationHistory, updateNotificationHistory, userHoldPendingSortMethod, userHoldReadySortMethod, userCheckoutSortMethod, updateListGroups, updateSavedSearches } = React.useContext(UserContext);
     const { library, catalogStatus, updateCatalogStatus, updateHomeScreenLinks } = React.useContext(LibrarySystemContext);
     const [notifications, setNotifications] = React.useState([]);
     const [messages, setILSMessages] = React.useState([]);
     const { category, list, maxNum, updateBrowseCategories, updateBrowseCategoryList, updateMaxCategories } = React.useContext(BrowseCategoryContext);
     const { checkouts, updateCheckouts } = React.useContext(CheckoutsContext);
     const { holds, updateHolds } = React.useContext(HoldsContext);
     const { language } = React.useContext(LanguageContext);
     const [invalidSession, setInvalidSession] = React.useState(false);
     const discoveryVersion = formatDiscoveryVersion(library.discoveryVersion) ?? '23.03.00';
     const { location, locations, updateLocations } = React.useContext(LibraryBranchContext);
     const { systemMessages, updateSystemMessages } = React.useContext(SystemMessagesContext);
     const [numFailedSessions, setNumFailedSessions] = React.useState(0);
     const [unlimited, setUnlimitedCategories] = React.useState(false);
     const [savedSearchesStorage, updateSavedSearchesStorage] = React.useState([]);
     const [maxCategories, setMaxCategories] = React.useState(5);

     React.useEffect(() => {
          const subscription = Notifications.addNotificationReceivedListener((notification) => {
               handleNewNotification(notification);
          });
          return () => subscription.remove();
     }, []);

     React.useEffect(() => {
          const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
               handleNewNotificationResponse(response);
          });
           const stateChangeSubscription = AppState.addEventListener('change', onAppStateChange)
          return () => {
               subscription.remove();
               stateChangeSubscription.remove();
          };
     }, []);

     useQuery(['catalog_status', library.baseUrl], () => getCatalogStatus(library.baseUrl), {
          enabled: !!library.baseUrl,
          refetchInterval: 60 * 1000 * 5,
          refetchIntervalInBackground: true,
          refetchOnWindowFocus: 'always',
          onSuccess: (data) => {
               if(data.ok) {
                    let catalogMessage = null;
                    if (data.data.result?.api?.message) {
                         catalogMessage = stripHTML(data.data.result.api.message);
                    }

                    let status = data.data.result?.catalogStatus ?? 0;
                    updateCatalogStatus({status: status, message: catalogMessage});
               } else {
                    logDebugMessage("Error fetching catalog status");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching catalog status");
               logErrorMessage(error);
          }
     });

     //MDN 25.08 DIS-276 Change to use refresh profile rather than reload profile because it utilizes caching within
     //Aspen Discovery to return results as quickly as possible.
     useQuery(['user', library.baseUrl, language], () => refreshProfile(library.baseUrl), {
          initialData: user,
          refetchInterval: 60 * 1000 * 5,
          refetchIntervalInBackground: true,
          refetchOnWindowFocus: 'always',
          onSuccess: (data) => {
               if(data.ok) {
                    const validProfile = data.data.result.success ?? true;
                    if (validProfile) {
                         setInvalidSession(false);
                         if (user) {
                              if (data.data.result.profile !== user) {
                                   updateUser(data.data.result.profile);
                                   updateLanguage(data.data.result.profile.interfaceLanguage ?? 'en');
                                   PATRON.language = data.data.result.profile.interfaceLanguage ?? 'en';
                              }
                         } else {
                              updateUser(data.data.result.profile);
                              updateLanguage(data.data.result.profile.interfaceLanguage ?? 'en');
                              PATRON.language = data.data.result.profile.interfaceLanguage ?? 'en';
                         }
                    } else {
                         //MDN 25.08 DIS-276 Change to use refresh profile rather than reload profile because it utilizes caching within
                         let errorFetching = data.errorFetching ?? false;
                         //If we had an error fetching data, do not force the user out
                         if (errorFetching === false) {
                              logWarnMessage("Session was invalid after reloading profile");
                              logWarnMessage(data);
                              setInvalidSession(true);
                         }
                         logErrorMessage(data); // go ahead and log the error so it goes to Sentry in hopes to identify issues
                    }
               } else {
                    logDebugMessage("Error reloading user profile");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error reloading user profile");
               logErrorMessage(error);
          }
     });

     useQuery(['browse_categories', library.baseUrl, language, maxNum], () => getHomeScreenFeed(maxNum, library.baseUrl), {
          refetchInterval: 60 * 1000 * 15,
          refetchIntervalInBackground: true,
          initialData: category,
          onSuccess: (data) => {
               if(data.ok) {
                    const result = data.data.result;
                    updateBrowseCategories(result.browseCategories);
                    updateHomeScreenLinks(result.homeScreenLinks);
               } else {
                    logDebugMessage("Error fetching browse categories and home screen links");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching browse categories");
               logErrorMessage(error);
          }
     });

     useQuery(['holds', user.id, library.baseUrl, language], () => getPatronHolds(userHoldReadySortMethod, userHoldPendingSortMethod, 'all', library.baseUrl, false, language), {
          refetchInterval: 60 * 1000 * 15,
          refetchIntervalInBackground: true,
          refetchOnWindowFocus: 'always',
          placeholderData: [],
          onSuccess: (data) => {
               if(data.ok) {
                    let holds = formatHolds(data.data.result.holds ?? []);
                    holds = sortHolds(holds, userHoldPendingSortMethod, userHoldReadySortMethod);
                    updateHolds(holds);
               } else {
                    logDebugMessage("Error fetching user holds");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching user holds");
               logErrorMessage(error);
          }
     });

     useQuery(['checkouts', user.id, library.baseUrl, language], () => getPatronCheckedOutItems('all', library.baseUrl, false, language), {
          refetchInterval: 60 * 1000 * 15,
          refetchIntervalInBackground: true,
          refetchOnWindowFocus: 'always',
          onSuccess: (data) => {
               if(data.ok) {
                    let checkouts = data.data.result.checkedOutItems ?? [];
                    checkouts = sortCheckouts(checkouts, userCheckoutSortMethod);
                    updateCheckouts(checkouts);
               } else {
                    logDebugMessage("Error fetching user checkouts");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching user checkouts");
               logErrorMessage(error);
          }
     });

     useQuery(['lists', user.id, library.baseUrl, language], () => getLists(library.baseUrl, 1, 20, 1), {
          refetchInterval: 60 * 1000 * 15,
          refetchIntervalInBackground: true,
          notifyOnChangeProps: ['data'],
          refetchOnWindowFocus: 'always',
          placeholderData: [],
          onSuccess: (data) => {
               if(data.ok) {
                    const results = data.data.result;
                    updateLists(results)
               } else {
                    logDebugMessage("Error fetching user lists");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching user lists");
               logErrorMessage(error);
          }
     });

     useQuery(['all_lists', user.id, library.baseUrl, language], () => getLists(library.baseUrl, 1, 20, 0), {
          refetchInterval: 60 * 1000 * 60,
          refetchIntervalInBackground: true,
          notifyOnChangeProps: ['data'],
          refetchOnWindowFocus: 'always',
          placeholderData: [],
          onSuccess: (data) => {
               if (data.ok) {
                    formatLists(data.data.result); // this is just for PATRON.lists which is used for populating Selects of user lists (Adding to List)
               } else {
                    logDebugMessage('Error fetching all user lists');
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage('Error fetching all user lists');
               logErrorMessage(error);
          },
     });

     useQuery(['list_groups', user.id, library.baseUrl, language], () => getListGroups(library.baseUrl), {
          refetchInterval: 60 * 1000 * 15,
          refetchIntervalInBackground: true,
          notifyOnChangeProps: ['data'],
          refetchOnWindowFocus: 'always',
          placeholderData: [],
          onSuccess: (data) => {
               if(data.ok) {
                    const groups = {
                         groups: data.data?.result?.groups ?? [],
                         unassigned: data.data?.result?.unassigned ?? 0
                    };
                    updateListGroups(groups);
               } else {
                    logDebugMessage("Error fetching user list groups");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching user list groups");
               logErrorMessage(error);
          }
     });

     useQuery(['linked_accounts', library.baseUrl, language], () => getLinkedAccounts(library.baseUrl, language), {
          initialData: accounts,
          refetchInterval: 60 * 1000 * 15,
          refetchIntervalInBackground: true,
          notifyOnChangeProps: ['data'],
          refetchOnWindowFocus: 'always',
          onSuccess: (data) => {
               if(data.ok) {
                    const linkedAccounts = formatLinkedAccounts(user, cards ?? [], library.barcodeStyle, data.data.result.linkedAccounts);
                    if (accounts !== linkedAccounts.accounts) {
                         updateLinkedAccounts(linkedAccounts.accounts);
                    }
                    if (cards !== linkedAccounts.cards) {
                         updateLibraryCards(linkedAccounts.cards);
                    }
               } else {
                    logDebugMessage("Error fetching linked accounts");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching linked accounts");
               logErrorMessage(error);
          }
     });

     useQuery(['viewer_accounts', user.id, library.baseUrl, language], () => getViewerAccounts(library.baseUrl, language), {
          initialData: viewers,
          refetchInterval: 60 * 1000 * 15,
          refetchIntervalInBackground: true,
          onSuccess: (data) => {
               if(data.ok) {
                    updateLinkedViewerAccounts(values(data.data?.result?.viewers ?? []));
               } else {
                    logDebugMessage("Error fetching linked viewer accounts");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching linked viewer accounts");
               logErrorMessage(error);
          }
     });

     useQuery(['notification_history', user.id, library.baseUrl, language], () => fetchNotificationHistory(1, 20, false, library.baseUrl, language), {
          initialData: notificationHistory,
          refetchInterval: 60 * 1000 * 5,
          refetchIntervalInBackground: true,
          onSuccess: (data) => {
               if(data.ok) {
                    const notificationHistory = formatNotificationHistory(data.data.result)
                    updateNotificationHistory(notificationHistory);
               } else {
                    logDebugMessage("Error fetching notification history");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching notification history");
               logErrorMessage(error);
          }
     });

     useQuery(['pickup_locations', library.baseUrl, language], () => getPickupLocations(library.baseUrl), {
          refetchInterval: 60 * 1000 * 30,
          refetchIntervalInBackground: true,
          placeholderData: [],
          onSuccess: (data) => {
               logDebugMessage("Finished pickup_locations query, setting data");
               if(data.ok) {
                    const pickupLocations = formatPickupLocations(data.data.result);
                    updatePickupLocations(pickupLocations.pickupLocations);
                    updatePreferredPickupLocationIsValid(pickupLocations.preferredPickupLocationIsValid);
                    updatePreferredPickupLocationWarning(pickupLocations.preferredPickupLocationWarning);
                    logDebugMessage("Finished pickup_locations query, done setting data");
               } else {
                    logDebugMessage("Error with pickup_locations query");
                    logDebugMessage(data);
                    getErrorMessage(data.code ?? 0, data.problem);
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching pickup locations");
               logErrorMessage(error);
          }
     });

     useQuery(['locations', library.baseUrl, language, userLatitude, userLongitude], () => getLocations(library.baseUrl, language, userLatitude, userLongitude), {
          refetchInterval: 60 * 1000 * 30,
          refetchIntervalInBackground: true,
          refetchOnWindowFocus: 'always',
          placeholderData: [],
          onSuccess: (data) => {
               if(data.ok){
                    updateLocations(data.data.result.locations);
               } else {
                    logDebugMessage("Error fetching locations");
                    logDebugMessage(data);
                    getErrorMessage(data.code, data.problem)
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching locations");
               logErrorMessage(error);
          }
     });

     useQuery(['saved_searches', user?.id ?? 'unknown', library.baseUrl, language], () => fetchSavedSearches(library.baseUrl, language), {
          refetchInterval: 60 * 1000 * 5,
          refetchIntervalInBackground: true,
          placeholderData: [],
          onSuccess: (data) => {
               if(data.ok) {
                    updateSavedSearches(data.data.result?.searches ?? []);
               } else {
                    logDebugMessage("Error fetching saved searches for user");
                    logDebugMessage(data);
                    getErrorMessage(data.code, data.problem)
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching saved searches for user");
               logErrorMessage(error);
          }
     });

     useQuery(['browse_categories_list', library.baseUrl, language], () => getBrowseCategoryListForUser(library.baseUrl), {
          refetchInterval: 60 * 1000 * 15,
          refetchIntervalInBackground: true,
          placeholderData: list,
          onSuccess: (data) => {
               if(data.ok){
                    const categories = _.sortBy(data.data.result, ['title']);
                    updateBrowseCategoryList(categories);
               } else {
                    logDebugMessage("Error fetching browse category list for user");
                    logDebugMessage(data);
                    getErrorMessage(data.code, data.problem)
               }
          },
          onError: (error) => {
               logDebugMessage("Error fetching browse category list for user");
               logErrorMessage(error);
          }
     });

     useQuery(['session', library.baseUrl, user.id], () => validateSession(library.baseUrl), {
          initialData: GLOBALS.appSessionId,
          refetchInterval: 86400000,
          refetchIntervalInBackground: true,
          retry: 5,
          onSuccess: (data) => {
               if(data.ok) {
                    if (typeof data.data.result?.session !== 'undefined') {
                         GLOBALS.appSessionId = data.data.result.session;
                    } else {
                         logWarnMessage("No session returned when validating session");
                    }
               } else {
                    logDebugMessage("Error validating session");
                    logDebugMessage(data);
                    getErrorMessage(data.code, data.problem)
               }
          },
          onError: (error) => {
               logDebugMessage("Error validating session");
               logErrorMessage(error);
          }
     });

     useFocusEffect(
          React.useCallback(() => {
               const update = async () => {
                    let latitude = await SecureStore.getItemAsync('latitude');
                    let longitude = await SecureStore.getItemAsync('longitude');
                    setUserLatitude(latitude);
                    setUserLongitude(longitude);

                    await reloadProfile(library.baseUrl).then((result) => {
                         if (user !== result) {
                              updateUser(result);
                         }
                    });

                    await getILSMessages(library.baseUrl).then((response) => {
                         if(response.ok) {
                              setILSMessages(response.data?.result?.messages ?? []);
                         } else {
                              logDebugMessage("Error fetching ILS messages");
                              logDebugMessage(response);
                              getErrorMessage(response.code, response.problem);
                         }
                    });
               };
               update().then(() => {
                    return () => update();
               });
          }, [])
     );

     const handleNewNotification = (notification) => {
          setNotifications(notification);
     };

     const handleNewNotificationResponse = async (response) => {
          await addStoredNotification(response);
          let url = decodeURIComponent(response.notification.request.content.data.url).replace(/\+/g, ' ');
          url = url.replace('aspen-lida://', prefix);

          const supported = await Linking.canOpenURL(url);
          if (supported) {
               try {
                    url = url.replace(prefix, '/');
                    logDebugMessage('Opening url in DrawerContent...');
                    logDebugMessage(url);
                    linkTo(url);
               } catch (e) {
                    logDebugMessage('Could not open url in DrawerContent');
                    logDebugMessage(e);
               }
          } else {
               logDebugMessage('Could not open url in DrawerContent');
               logDebugMessage(url);
          }
     };

     const [finesSummary, setFinesSummary] = React.useState('');
     React.useEffect(() => {
          async function fetchTranslations() {
               await getTranslationsWithValues('accounts_have_fines', user.fines ?? 0, language, library.baseUrl).then((result) => {
                    let term = _.toString(result);
                    if (!term.includes('%')) {
                         setFinesSummary(term);
                    }
               });
          }

          fetchTranslations();
     }, [language]);

     const displayFinesAlert = () => {
          if (user.finesVal) {
               if (user.finesVal > 0.01) {
                    let message = 'Your accounts have ' + user.fines + ' in fines.';
                    if (finesSummary) {
                         message = finesSummary;
                    }
                    return showILSMessage('error', message);
               }
          }

          return null;
     };

     const displayILSMessages = () => {
          if (messages) {
               if (_.isArray(messages)) {
                    return messages.map((obj, index) => {
                         if (obj.message) {
                              return showILSMessage(obj.messageStyle, obj.message, index);
                         }
                    });
               }
          }

          return null;
     };

     if (catalogStatus > 0) {
          return <CatalogOffline />;
     }

     if (invalidSession === true || invalidSession === 'true') {
          logDebugMessage("Session is invalid, preparing to show invalid credentials alert");
          return <InvalidCredentials />;
     }


     return (
          <SafeAreaView style={{ flex: 1 }} edges={Platform.OS === 'android' ? ['top'] : ['top', 'bottom']}>
               <DrawerContentScrollView
                    contentContainerStyle={{
                         paddingBottom: Platform.OS === 'android' ? insets.bottom - 50 : 0,
                         flexGrow: 1
                    }}
               >
                    <VStack space="4" my="2" mx="1" flex={1}>
                         <UserProfileOverview />

                         {displayILSMessages()}

                         <Divider />

                         <VStack divider={<Divider />} space="4" flex={1}>
                              <VStack>
                                   <Checkouts />
                                   <Holds />
                                   <UserLists />
                                   <SavedSearches />
                                   <ReadingHistory />
                                        <YearInReview />
                                   <Fines />
                                   <NotificationHistory />
                                   <Events />
                                   <Campaigns />
                              </VStack>

                              <VStack space="3">
                                   <VStack>
                                        <UserProfile />
                                        <LinkedAccounts />
                                        <AlternateLibraryCard />
                                   </VStack>
                              </VStack>
                         </VStack>

                         {/* logout button, color mode switcher, language switcher */}
                         <VStack space={3} alignItems="center" pt="4">
                              <HStack space={2}>
                                   <LogOutButton />
                              </HStack>
                              <HStack space={2}>
                                   <UseColorMode showText={false} />
                                   <LanguageSwitcher />
                              </HStack>
                         </VStack>
                    </VStack>
               </DrawerContentScrollView>
               {Platform.OS === 'android' && (
                    <View style={{ height: insets.bottom, backgroundColor: 'transparent' }} />
               )}
          </SafeAreaView>
     );
};

const UserProfileOverview = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);

     let icon;
     if (!_.isUndefined(library.logoApp)) {
          icon = library.logoApp;
     } else if (!_.isUndefined(library.favicon)) {
          icon = library.favicon;
     } else {
          icon = Constants.expoConfig.ios.icon;
     }

     return (
          <Box px="4">
               <HStack space={3} alignItems="center">
                    <Image source={{ uri: icon }} fallbackSource={require('../../themes/default/aspenLogo.png')} w={42} h={42} alt={getTermFromDictionary(language, 'library_card')} rounded="8" />
                    <Box>
                         {user && user.displayName ? (
                              <Text bold fontSize="14" isTruncated maxW="175">
                                   {user.displayName}
                              </Text>
                         ) : null}

                         {library && library.displayName ? (
                              <Text fontSize="12" fontWeight="500" isTruncated maxW="175">
                                   {library.displayName}
                              </Text>
                         ) : null}
                         <HStack space={1} alignItems="center">
                              <Icon as={MaterialIcons} name="credit-card" size="xs" />
                              {user && (user.ils_barcode || user.cat_username) ? (
                                   <Text fontSize="12" fontWeight="500" isTruncated maxW="175">
                                        {user.ils_barcode ?? user.cat_username}
                                   </Text>
                              ) : null}
                         </HStack>
                    </Box>
               </HStack>
          </Box>
     );
};

const Checkouts = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);

     const [checkoutSummary, setCheckoutSummary] = React.useState('');
     React.useEffect(() => {
          async function fetchTranslations() {
               await getTranslationsWithValues('checkouts_overdue_summary', user.numOverdue ?? 0, language, library.baseUrl).then((result) => {
                    let term = result;
                    if (!term.includes('%')) {
                         setCheckoutSummary(term);
                    }
               });
          }

          fetchTranslations();
     }, [language]);

     return (
          <Pressable
               px="2"
               py="2"
               rounded="md"
               onPress={() => {
                    navigateStack('AccountScreenTab', 'MyCheckouts', {
                         libraryUrl: library.baseUrl,
                         hasPendingChanges: false,
                    });
               }}>
               <HStack space="1" alignItems="center">
                    <Icon as={MaterialIcons} name="chevron-right" size="7" />
                    <VStack w="100%">
                         <Text fontWeight="500">
                              {getTermFromDictionary(language, 'checked_out_titles')} {user ? <Text bold>({user.numCheckedOut ?? 0})</Text> : null}
                         </Text>
                    </VStack>
               </HStack>
               {user.numOverdue > 0 ? (
                    <Container>
                         <Badge colorScheme="error" ml={10} rounded="4px" _text={{ fontSize: 'xs' }}>
                              {checkoutSummary}
                         </Badge>
                    </Container>
               ) : null}
          </Pressable>
     );
};

const Holds = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);

     const [holdSummary, setHoldSummary] = React.useState('');
     React.useEffect(() => {
          async function fetchTranslations() {
               await getTranslationsWithValues('num_holds_ready_for_pickup', user.numHoldsAvailable ?? 0, language, library.baseUrl).then((result) => {
                    let term = result;
                    if (!term.includes('%')) {
                         setHoldSummary(term);
                    }
               });
          }

          fetchTranslations();
     }, [language]);

     return (
          <Pressable
               px="2"
               py="3"
               rounded="md"
               onPress={() => {
                    navigateStack('AccountScreenTab', 'MyHolds', {
                         libraryUrl: library.baseUrl,
                         hasPendingChanges: false,
                    });
               }}>
               <HStack space="1" alignItems="center">
                    <Icon as={MaterialIcons} name="chevron-right" size="7" />
                    <VStack w="100%">
                         <Text fontWeight="500">
                              {getTermFromDictionary(language, 'titles_on_hold')} {user ? <Text bold>({user.numHolds ?? 0})</Text> : null}
                         </Text>
                    </VStack>
               </HStack>
               {user.numHoldsAvailable > 0 ? (
                    <Container>
                         <Badge colorScheme="success" ml={10} rounded="4px" _text={{ fontSize: 'xs' }}>
                              {holdSummary}
                         </Badge>
                    </Container>
               ) : null}
          </Pressable>
     );
};

const UserLists = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const version = formatDiscoveryVersion(library.discoveryVersion);

     if (version >= '22.08.00') {
          return (
               <Pressable
                    px="2"
                    py="3"
                    rounded="md"
                    onPress={() => {
                         navigateStack('AccountScreenTab', 'MyLists', {
                              libraryUrl: library.baseUrl,
                              hasPendingChanges: false,
                         });
                    }}>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <VStack w="100%">
                              <Text fontWeight="500">
                                   {getTermFromDictionary(language, 'my_lists')} {user ? <Text bold>({user.numLists ?? 0})</Text> : null}
                              </Text>
                         </VStack>
                    </HStack>
               </Pressable>
          );
     }

     return (
          <Pressable
               px="2"
               py="3"
               rounded="md"
               onPress={() => {
                    navigateStack('MyListsStack', 'MyLists', {
                         libraryUrl: library.baseUrl,
                         hasPendingChanges: false,
                    });
               }}>
               <HStack space="1" alignItems="center">
                    <Icon as={MaterialIcons} name="chevron-right" size="7" />
                    <VStack w="100%">
                         <Text fontWeight="500">{getTermFromDictionary(language, 'my_lists')}</Text>
                    </VStack>
               </HStack>
          </Pressable>
     );
};

const SavedSearches = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const version = formatDiscoveryVersion(library.discoveryVersion);

     const [savedSearchSummary, setSavedSearchSummary] = React.useState('');
     React.useEffect(() => {
          async function fetchTranslations() {
               await getTranslationsWithValues('num_saved_searches_with_updates', user.numSavedSearchesNew ?? 0, language, library.baseUrl).then((result) => {
                    let term = result;
                    if (!term.includes('%')) {
                         setSavedSearchSummary(term);
                    }
               });
          }

          fetchTranslations();
     }, [language]);

     if (version >= '22.08.00') {
          return (
               <Pressable
                    px="2"
                    py="3"
                    rounded="md"
                    onPress={() => {
                         navigateStack('AccountScreenTab', 'MySavedSearches', {
                              libraryUrl: library.baseUrl,
                              hasPendingChanges: false,
                         });
                    }}>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <VStack w="100%">
                              <Text fontWeight="500">
                                   {getTermFromDictionary(language, 'saved_searches')} {user ? <Text bold>({user.numSavedSearches ?? 0})</Text> : null}
                              </Text>
                         </VStack>
                    </HStack>
                    {user.numSavedSearchesNew > 0 ? (
                         <Container>
                              <Badge colorScheme="warning" ml={10} rounded="4px" _text={{ fontSize: 'xs' }}>
                                   {savedSearchSummary}
                              </Badge>
                         </Container>
                    ) : null}
               </Pressable>
          );
     }

     return null;
};

const ReadingHistory = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const version = formatDiscoveryVersion(library.discoveryVersion);

     if (version >= '23.01.00') {
          return (
               <Pressable
                    px="2"
                    py="3"
                    rounded="md"
                    onPress={() => {
                         navigateStack('AccountScreenTab', 'MyReadingHistory', {
                              libraryUrl: library.baseUrl,
                              hasPendingChanges: false,
                         });
                    }}>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <VStack w="100%">
                              <Text fontWeight="500">
                                   {getTermFromDictionary(language, 'reading_history')} <Text bold>({user.numReadingHistory ?? 0})</Text>
                              </Text>
                         </VStack>
                    </HStack>
               </Pressable>
          );
     }else{
          logDebugMessage("Version too old to show Reading History " + version);
     }

     return null;
};

const UserProfile = () => {
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);

     return (
          <Pressable
               px="2"
               py="3"
               onPress={() => {
                    navigateStack('AccountScreenTab', 'MyProfile', {
                         libraryUrl: library.baseUrl,
                         hasPendingChanges: false,
                    });
               }}>
               <HStack space="1" alignItems="center">
                    <Icon as={MaterialIcons} name="chevron-right" size="7" />
                    <Text fontWeight="500">{getTermFromDictionary(language, 'contact_information')}</Text>
               </HStack>
          </Pressable>
     );
};

const NotificationHistory = () => {
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);

     if (library.displayIlsInbox === '1' || library.displayIlsInbox === 1 || library.displayIlsInbox === true) {
          return (
               <Pressable
                    px="2"
                    py="3"
                    onPress={() => {
                         navigateStack('AccountScreenTab', 'MyNotificationHistory', {
                              hasPendingChanges: false,
                         });
                    }}>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <Text fontWeight="500">{getTermFromDictionary(language, 'notification_history')}</Text>
                    </HStack>
               </Pressable>
          );
     }
};

const LinkedAccounts = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const version = formatDiscoveryVersion(library.discoveryVersion);

     if (library.allowLinkedAccounts === '1') {
          return (
               <Pressable
                    px="2"
                    py="2"
                    onPress={() =>
                         navigateStack('AccountScreenTab', 'MyLinkedAccounts', {
                              libraryUrl: library.baseUrl,
                              hasPendingChanges: false,
                         })
                    }>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <Text fontWeight="500">
                              {getTermFromDictionary(language, 'linked_accounts')} <Text bold>({user.numLinkedAccounts ?? 0})</Text>
                         </Text>
                    </HStack>
               </Pressable>
          );
     }

     return null;
};

const UserPreferences = () => {
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);

     return (
          <Pressable
               px="2"
               py="3"
               onPress={() => {
                    navigateStack('AccountScreenTab', 'MyPreferences', {
                         libraryUrl: library.baseUrl,
                         hasPendingChanges: false,
                    });
               }}>
               <HStack space="1" alignItems="center">
                    <Icon as={MaterialIcons} name="chevron-right" size="7" />
                    <Text fontWeight="500">{getTermFromDictionary(language, 'preferences')}</Text>
               </HStack>
          </Pressable>
     );
};

const AlternateLibraryCard = () => {
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const version = formatDiscoveryVersion(library.discoveryVersion);

     let shouldShowAlternateLibraryCard = false;
     if (typeof library.showAlternateLibraryCard !== 'undefined') {
          shouldShowAlternateLibraryCard = library.showAlternateLibraryCard;
     }

     if (version >= '24.09.00' && (shouldShowAlternateLibraryCard === '1' || shouldShowAlternateLibraryCard === 1)) {
          return (
               <Pressable
                    px="2"
                    py="3"
                    rounded="md"
                    onPress={() => {
                         navigateStack('LibraryCardTab', 'MyAlternateLibraryCard', {
                              prevRoute: 'AccountDrawer',
                              hasPendingChanges: false,
                         });
                    }}>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <Text fontWeight="500">{getTermFromDictionary(language, 'alternate_library_card')}</Text>
                    </HStack>
               </Pressable>
          );
     }

     return null;
};

const Fines = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const version = formatDiscoveryVersion(library.discoveryVersion);
     const backgroundColor = useToken('colors', useColorModeValue('warmGray.200', 'coolGray.900'));
     const textColor = useToken('colors', useColorModeValue('gray.800', 'coolGray.200'));

     let shouldShowFines = true;
     if (typeof library.showFines !== 'undefined') {
          shouldShowFines = library.showFines;
     }

     let userFineAmount = user.fines ?? '$0.00';
     let hasFines = false;
     if (user.fines) {
          userFineAmount = userFineAmount.substring(1);
          userFineAmount = Number(userFineAmount);
          if (userFineAmount > 0) {
               hasFines = true;
          }
     }

     if (version >= '24.01.00' && shouldShowFines) {
          return (
               <Pressable px="2" py="3" rounded="md" onPress={async () => await passUserToDiscovery(library.baseUrl, 'Fines', user.id, backgroundColor, textColor)}>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <VStack w="100%">
                              <Text fontWeight="500">{getTermFromDictionary(language, 'fines')}</Text>
                         </VStack>
                    </HStack>

                    <Container>
                         <Badge colorScheme={hasFines ? 'error' : 'info'} ml={10} rounded="4px" _text={{ fontSize: 'xs' }}>
                              {user.fines ?? '$0.00'}
                         </Badge>
                    </Container>
               </Pressable>
          );
     }

     return null;
};

const Events = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const version = formatDiscoveryVersion(library.discoveryVersion);

     const [savedEventsSummary, setSavedEventsSummary] = React.useState('');
     React.useEffect(() => {
          async function fetchTranslations() {
               await getTranslationsWithValues('num_saved_events_upcoming', user.numSavedEventsUpcoming ?? 0, language, library.baseUrl).then((result) => {
                    let term = result;
                    if (!term.includes('%1%')) {
                         setSavedEventsSummary(term);
                    }
               });
          }

          fetchTranslations();
     }, [language]);

     if (version >= '24.02.00' && library.hasEventSettings) {
          return (
               <Pressable
                    px="2"
                    py="3"
                    rounded="md"
                    onPress={() => {
                         navigateStack('AccountScreenTab', 'MyEvents', {
                              libraryUrl: library.baseUrl,
                              hasPendingChanges: false,
                         });
                    }}>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <VStack w="100%">
                              <Text fontWeight="500">
                                   {getTermFromDictionary(language, 'events')}
                              </Text>
                         </VStack>
                    </HStack>
                    {user.numSavedEventsUpcoming > 0 ? (
                         <Container>
                              <Badge colorScheme="info" ml={10} rounded="4px" _text={{ fontSize: 'xs' }}>
                                   {savedEventsSummary}
                              </Badge>
                         </Container>
                    ) : null}
               </Pressable>
          );
     }

     return null;
};

const YearInReview = () => {
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const version = formatDiscoveryVersion(library.discoveryVersion);
     const backgroundColor = useToken('colors', useColorModeValue('warmGray.200', 'coolGray.900'));
     const textColor = useToken('colors', useColorModeValue('gray.800', 'coolGray.200'));

     let shouldShowYearInReview = false;
     if (typeof user.hasYearInReview !== 'undefined') {
          shouldShowYearInReview = user.hasYearInReview;
     }

     if (version >= '24.12.00' && shouldShowYearInReview) {
          return (
               <Pressable px="2" py="3" rounded="md" onPress={async () => await passUserToDiscovery(library.baseUrl, 'YearInReview', user.id, backgroundColor, textColor)}>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7" />
                         <VStack w="100%">
                              <Text fontWeight="500">{user.yearInReviewName ?? getTermFromDictionary(language, 'year_in_review')}</Text>
                         </VStack>
                    </HStack>

                    <Container>
                         <Badge colorScheme="info" ml={10} rounded="4px" _text={{ fontSize: 'xs' }}>
                              {getTermFromDictionary(language, 'view_now')}
                         </Badge>
                    </Container>
               </Pressable>
          );
     }

     return null;
};

const Campaigns = () => {
     const { user } = React.useContext(UserContext);
	const { library } = React.useContext(LibrarySystemContext);
	const { language } = React.useContext(LanguageContext);
     if (library.hasCommunityEngagementEnabled) {
          return(
               <Pressable
                    px="2"
                    py="3"
                    rounded="md"
                    onPress={() =>
                         navigateStack('AccountScreenTab', 'MyCampaigns', {
                              libraryUrl: library.baseUrl,
                              hasPendingChanges: false,
                         })
                    }>
                    <HStack space="1" alignItems="center">
                         <Icon as={MaterialIcons} name="chevron-right" size="7"/>
                         <VStack w="100%">
                              <Text fontWeight="500">
                                   {getTermFromDictionary(language, 'campaigns')}
                              </Text>
                         </VStack>
                    </HStack>
               </Pressable>
          );
     }
}

async function getStoredNotifications() {
     try {
          const notifications = await AsyncStorage.getItem('@notifications');
          return notifications != null ? JSON.parse(notifications) : null;
     } catch (e) {
          console.log(e);
     }
}

async function createNotificationStorage(message) {
     try {
          const array = [];
          array.push(message);
          const notification = JSON.stringify(array);
          await AsyncStorage.setItem('@notifications', notification);
     } catch (e) {
          console.log(e);
     }
}

async function addStoredNotification(message) {
     await getStoredNotifications().then(async (response) => {
          if (response) {
               response.push(message);
               try {
                    await AsyncStorage.setItem('@notifications', JSON.stringify(response));
               } catch (e) {
                    console.log(e);
               }
          } else {
               await createNotificationStorage(message);
          }
     });
}

function LogOutButton() {
     const { language } = React.useContext(LanguageContext);
     const { signOut } = React.useContext(AuthContext);

     return (
          <Button size="md" colorScheme="secondary" onPress={signOut} leftIcon={<Icon as={MaterialIcons} name="logout" size="xs" />}>
               {getTermFromDictionary(language, 'logout')}
          </Button>
     );
}

const ReloadProfileButton = (props) => {
     const { language } = React.useContext(LanguageContext);

     return (
          <Button size="xs" colorScheme="tertiary" onPress={() => props.handleRefreshProfile(props.libraryUrl)} variant="ghost" leftIcon={<Icon as={MaterialIcons} name="refresh" size="xs" />}>
               {getTermFromDictionary(language, 'refresh_account')}
          </Button>
     );
};
