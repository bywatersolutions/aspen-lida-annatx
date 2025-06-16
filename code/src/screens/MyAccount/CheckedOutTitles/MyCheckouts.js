import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { AlertDialog, Box, Button, Center, CheckIcon, FlatList, FormControl, HStack, Icon, ScrollView, Select, Text, VStack } from 'native-base';
import React from 'react';
import { Platform, SafeAreaView } from 'react-native';

// custom components and helper files
import { loadingSpinner } from '../../../components/loadingSpinner';
import { DisplaySystemMessage } from '../../../components/Notifications';
import { CheckoutsContext, LanguageContext, LibrarySystemContext, SystemMessagesContext, ThemeContext, UserContext } from '../../../context/initialContext';
import { getTermFromDictionary, getTranslationsWithValues } from '../../../translations/TranslationService';
import { confirmRenewAllCheckouts, confirmRenewCheckout, renewAllCheckouts } from '../../../util/accountActions';
import { getPatronCheckedOutItems, setSortPreferences, sortCheckouts } from '../../../util/api/user';
import { stripHTML } from '../../../util/apiAuth';
import { MyCheckout } from './MyCheckout';

export const MyCheckouts = () => {
     const isFetchingCheckouts = useIsFetching({ queryKey: ['checkouts'] });
     const queryClient = useQueryClient();
     const navigation = useNavigation();
     const { user, updateUser, userCheckoutSortMethod, updateUserCheckoutSortMethod } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { checkouts, updateCheckouts } = React.useContext(CheckoutsContext);
     const { language } = React.useContext(LanguageContext);
     const [checkoutSource, setCheckoutSource] = React.useState('all');
     const [isLoading, setLoading] = React.useState(false);
     const [renewAll, setRenewAll] = React.useState(false);
     const { systemMessages, updateSystemMessages } = React.useContext(SystemMessagesContext);
     const [filterByLibby, setFilterByLibby] = React.useState(false);

     const [renewConfirmationIsOpen, setRenewConfirmationIsOpen] = React.useState(false);
     const onRenewConfirmationClose = () => setRenewConfirmationIsOpen(false);
     const renewConfirmationRef = React.useRef(null);
     const [renewConfirmationResponse, setRenewConfirmationResponse] = React.useState('');
     const [confirmingRenewal, setConfirmingRenewal] = React.useState(false);
     const { theme, textColor, colorMode } = React.useContext(ThemeContext);

     const [checkoutsBy, setCheckoutBy] = React.useState({
          ils: 'Checked Out Titles for Physical Materials',
          hoopla: 'Checked Out Titles for Hoopla',
          overdrive: 'Checked Out Titles for Libby',
          axis_360: 'Checked Out Titles for Boundless',
          cloud_library: 'Checked Out Titles for cloudLibrary',
          palace_project: 'Checked Out Titles for Palace Project',
          all: 'Checked Out Titles',
     });

     const [sortBy, setSortBy] = React.useState({
          title: 'Sort by Title',
          author: 'Sort by Author',
          due_asc: 'Sort by Due Date Ascending',
          due_desc: 'Sort by Due Date Descending',
          format: 'Sort by Format',
          library_account: 'Sort by Library Account',
          times_renewed: 'Sort by Times Renewed',
     });

     React.useLayoutEffect(() => {
          navigation.setOptions({
               headerLeft: () => <Box />,
          });
     }, [navigation]);

     useQuery(['checkouts', user.id, library.baseUrl, language], () => getPatronCheckedOutItems('all', library.baseUrl, false, language), {
          placeholderData: checkouts,
          onSuccess: (data) => {
               const sortedCheckouts = sortCheckouts(data, userCheckoutSortMethod);
               updateCheckouts(sortedCheckouts);
          },
          onSettle: (data) => setLoading(false),
     });

     const toggleSort = async (value) => {
          updateUserCheckoutSortMethod(value);
          const sortedCheckouts = sortCheckouts(checkouts, value);
          await setSortPreferences('sort', value, language, library.baseUrl);
          updateCheckouts(sortedCheckouts);
     };

     const toggleCheckoutSource = async (value) => {
          const originalCheckoutSource = checkoutSource;
          setCheckoutSource(value);
          //setLoading(true);
          //console.log('changing checkouts from ' + originalCheckoutSource + ' to ' + value);
          if (!_.isNull(value)) {
               if (value === 'ils') {
                    navigation.setOptions({ title: checkoutsBy.ils });
               } else if (value === 'overdrive') {
                    navigation.setOptions({ title: checkoutsBy.overdrive });
               } else if (value === 'cloud_library') {
                    navigation.setOptions({ title: checkoutsBy.cloud_library });
               } else if (value === 'hoopla') {
                    navigation.setOptions({ title: checkoutsBy.hoopla });
               } else if (value === 'axis360') {
                    navigation.setOptions({ title: checkoutsBy.axis_360 });
               } else if (value === 'project_palace') {
                    navigation.setOptions({ title: checkoutsBy.palace_project });
               } else {
                    navigation.setOptions({ title: checkoutsBy.all });
               }

               //console.log("Clearing previous checkouts queries for " + originalCheckoutSource);
               //await queryClient.invalidateQueries({ queryKey: ['checkouts', user.id, library.baseUrl, originalCheckoutSource] });
               //console.log("Re-fetching checkout queries for " + value);
               //await queryClient.invalidateQueries({ queryKey: ['checkouts', user.id, library.baseUrl, value] });
               //await queryClient.refetchQueries({ queryKey: ['checkouts', user.id, library.baseUrl, value] });

          }
          //setLoading(false);
     };

     useFocusEffect(
          React.useCallback(() => {
               const update = async () => {
                    let tmp = checkoutsBy;
                    let term = '';

                    term = getTermFromDictionary(language, 'checkouts_for_all');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'all', term);
                         setCheckoutBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'checkouts_for_ils');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'ils', term);
                         setCheckoutBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'checkouts_for_libby');
                    if (library.libbyReaderName) {
                         term = await getTranslationsWithValues('checkouts_for_libby', library.libbyReaderName, language, library.baseUrl);
                         if (term[0]) {
                              term = term[0];
                         }

                         let filterTerm = await getTranslationsWithValues('filter_by_libby', library.libbyReaderName, language, library.baseUrl);
                         if (filterTerm[0]) {
                              setFilterByLibby(filterTerm[0]);
                         } else {
                              filterTerm = getTermFromDictionary(language, 'filter_by_libby');
                              setFilterByLibby(filterTerm);
                         }
                    }

                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'overdrive', term);
                         setCheckoutBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'checkouts_for_hoopla');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'hoopla', term);
                         setCheckoutBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'checkouts_for_cloud_library');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'cloud_library', term);
                         setCheckoutBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'checkouts_for_boundless');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'axis_360', term);
                         setCheckoutBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'checkouts_for_palace_project');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'palace_project', term);
                         setCheckoutBy(tmp);
                    }

                    tmp = sortBy;

                    term = getTermFromDictionary(language, 'sort_by_title');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'title', term);
                         setSortBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'sort_by_author');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'author', term);
                         setSortBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'sort_by_due_asc');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'due_asc', term);
                         setSortBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'sort_by_due_desc');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'due_desc', term);
                         setSortBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'sort_by_format');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'format', term);
                         setSortBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'sort_by_library_account');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'library_account', term);
                         setSortBy(tmp);
                    }

                    term = getTermFromDictionary(language, 'sort_by_times_renewed');
                    if (!term.includes('%1%')) {
                         tmp = _.set(tmp, 'times_renewed', term);
                         setSortBy(tmp);
                    }

                    setLoading(false);
               };
               update().then(() => {
                    return () => update();
               });
          }, [language])
     );

     if (isFetchingCheckouts || isLoading) {
          return loadingSpinner();
     }

     let numCheckedOut = 0;
     if (!_.isUndefined(user.numCheckedOut)) {
          numCheckedOut = user.numCheckedOut;
     }

     const noCheckouts = () => {
          return (
               <Center mt={5} mb={5}>
                    <Text bold fontSize="lg">
                         {getTermFromDictionary(language, 'no_checkouts')}
                    </Text>
               </Center>
          );
     };

     const reloadCheckouts = async () => {
          setLoading(true);
          queryClient.invalidateQueries({ queryKey: ['user', library.baseUrl, language] });
          queryClient.invalidateQueries({ queryKey: ['checkouts', user.id, library.baseUrl, language] });
          setLoading(false);
     };

     const filterCheckouts = (source) => {
     }

     const actionButtons = () => {
          let checkoutSourceLabel = getTermFromDictionary(language, 'filter_by_all') + ' (' + (user.numCheckedOut ?? 0) + ')';
          if (checkoutSource === 'all') {
               checkoutSourceLabel = getTermFromDictionary(language, 'filter_by_all') + ' (' + (user.numCheckedOut ?? 0) + ')';
          } else if (checkoutSource === 'ils') {
               checkoutSourceLabel = getTermFromDictionary(language, 'filter_by_ils') + ' (' + (user.numCheckedOutIls ?? 0) + ')';
          } else if (checkoutSource === 'overdrive') {
               checkoutSourceLabel = filterByLibby + ' (' + (user.numCheckedOutOverDrive ?? 0) + ')';
          } else if (checkoutSource === 'hoopla') {
               checkoutSourceLabel = getTermFromDictionary(language, 'filter_by_hoopla') + ' (' + (user.numCheckedOut_Hoopla ?? 0) + ')';
          } else if (checkoutSource === 'cloud_library') {
               checkoutSourceLabel = getTermFromDictionary(language, 'filter_by_cloud_library') + ' (' + (user.numCheckedOut_cloudLibrary ?? 0) + ')';
          } else if (checkoutSource === 'axis360') {
               checkoutSourceLabel = getTermFromDictionary(language, 'filter_by_boundless') + ' (' + (user.numCheckedOut_axis360 ?? 0) + ')';
          } else if (checkoutSource === 'palace_project') {
               checkoutSourceLabel = getTermFromDictionary(language, 'filter_by_palace_project') + ' (' + (user.numCheckedOut_PalaceProject ?? 0) + ')';
          }

          let checkoutsSourceLabelLength = 8 * checkoutSourceLabel.length + 80;

          let sortLength = 8 * sortBy.title.length + 80;
          if (userCheckoutSortMethod === 'author') {
               sortLength = 8 * sortBy.author.length + 80;
          } else if (userCheckoutSortMethod === 'format') {
               sortLength = 8 * sortBy.format.length + 80;
          } else if (userCheckoutSortMethod === 'dueAsc') {
               sortLength = 8 * sortBy.due_asc.length + 80;
          } else if (userCheckoutSortMethod === 'dueDesc') {
               sortLength = 8 * sortBy.due_desc.length + 80;
          } else if (userCheckoutSortMethod === 'libraryAccount') {
               sortLength = 8 * sortBy.library_account.length + 80;
          } else if (userCheckoutSortMethod === 'timesRenewed') {
               sortLength = 8 * sortBy.times_renewed.length + 80;
          }

          if (numCheckedOut > 0) {
               return (
                    <VStack space={2}>
                         <HStack space={2}>
                              <Button
                                   isLoading={renewAll}
                                   isLoadingText={getTermFromDictionary(language, 'renewing_all', true)}
                                   size="sm"
                                   variant="solid"
                                   colorScheme="primary"
                                   onPress={() => {
                                        setRenewAll(true);
                                        renewAllCheckouts(library.baseUrl, language).then((result) => {
                                             if (result?.confirmRenewalFee && result.confirmRenewalFee) {
                                                  setRenewConfirmationResponse({
                                                       message: result.api.message,
                                                       title: result.api.title,
                                                       confirmRenewalFee: result.confirmRenewalFee ?? false,
                                                       recordId: record ?? null,
                                                       action: result.api.action,
                                                       renewType: 'all',
                                                  });
                                             }

                                             if (result?.confirmRenewalFee && result.confirmRenewalFee) {
                                                  setRenewConfirmationIsOpen(true);
                                             } else {
                                                  reloadCheckouts();
                                             }

                                             setRenewAll(false);
                                        });
                                   }}
                                   startIcon={<Icon as={MaterialIcons} name="autorenew" size={5} />}>
                                   {getTermFromDictionary(language, 'checkout_renew_all')}
                              </Button>
                              <Button
                                   _dark={{
                                        borderWidth: '1',
                                        borderColor: 'gray.400',
                                   }}
                                   size="sm"
                                   variant="outline"
                                   onPress={() => {
                                        setLoading(true);
                                        reloadCheckouts();
                                   }}>
                                   {getTermFromDictionary(language, 'checkouts_reload')}
                              </Button>
                              <FormControl w={checkoutsSourceLabelLength}>
                                   <Select
                                        isReadOnly={Platform.OS === 'android'}
                                        name="checkoutSource"
                                        _dark={{
                                             borderWidth: '1',
                                             borderColor: 'gray.400',
                                        }}
                                        selectedValue={checkoutSource}
                                        accessibilityLabel={getTermFromDictionary(language, 'filter_by_source_label')}
                                        _selectedItem={{
                                             bg: 'tertiary.300',
                                             endIcon: <CheckIcon size="5" />,
                                        }}
                                        onValueChange={(itemValue) => toggleCheckoutSource(itemValue)}>
                                        <Select.Item label={getTermFromDictionary(language, 'filter_by_all') + ' (' + (user.numCheckedOut ?? 0) + ')'} value="all" key={0} />
                                        <Select.Item label={getTermFromDictionary(language, 'filter_by_ils') + ' (' + (user.numCheckedOutIls ?? 0) + ')'} value="ils" key={1} />
                                        {user.isValidForOverdrive ? <Select.Item label={filterByLibby + ' (' + (user.numCheckedOutOverDrive ?? 0) + ')'} value="overdrive" key={2} /> : null}
                                        {user.isValidForHoopla ? <Select.Item label={getTermFromDictionary(language, 'filter_by_hoopla') + ' (' + (user.numCheckedOut_Hoopla ?? 0) + ')'} value="hoopla" key={3} /> : null}
                                        {user.isValidForCloudLibrary ? <Select.Item label={getTermFromDictionary(language, 'filter_by_cloud_library') + ' (' + (user.numCheckedOut_cloudLibrary ?? 0) + ')'} value="cloud_library" key={4} /> : null}
                                        {user.isValidForAxis360 ? <Select.Item label={getTermFromDictionary(language, 'filter_by_boundless') + ' (' + (user.numCheckedOut_axis360 ?? 0) + ')'} value="axis360" key={5} /> : null}
                                        {user.isValidForPalaceProject ? <Select.Item label={getTermFromDictionary(language, 'filter_by_palace_project') + ' (' + (user.numCheckedOut_PalaceProject ?? 0) + ')'} value="palace_project" key={6} /> : null}
                                   </Select>
                              </FormControl>
                         </HStack>
                         <HStack space={2}>
                              <FormControl w={sortLength}>
                                   <Select
                                        isReadOnly={Platform.OS === 'android'}
                                        _dark={{
                                             borderWidth: '1',
                                             borderColor: 'gray.400',
                                        }}
                                        name="sortBy"
                                        selectedValue={userCheckoutSortMethod}
                                        accessibilityLabel={getTermFromDictionary(language, 'select_sort_method')}
                                        _selectedItem={{
                                             bg: 'tertiary.300',
                                             endIcon: <CheckIcon size="5" />,
                                        }}
                                        onValueChange={(itemValue) => toggleSort(itemValue)}>
                                        <Select.Item label={sortBy.title} value="sortTitle" key={0} />
                                        <Select.Item label={sortBy.author} value="author" key={1} />
                                        <Select.Item label={sortBy.due_asc} value="dueAsc" key={2} />
                                        <Select.Item label={sortBy.due_desc} value="dueDesc" key={3} />
                                        <Select.Item label={sortBy.format} value="format" key={4} />
                                        <Select.Item label={sortBy.library_account} value="libraryAccount" key={5} />
                                        <Select.Item label={sortBy.times_renewed} value="timesRenewed" key={6} />
                                   </Select>
                              </FormControl>
                         </HStack>
                    </VStack>
               );
          } else {
               return (
                    <HStack>
                         <Button
                              size="sm"
                              variant="outline"
                              onPress={() => {
                                   setLoading(true);
                                   reloadCheckouts();
                              }}>
                              {getTermFromDictionary(language, 'checkouts_reload')}
                         </Button>
                    </HStack>
               );
          }
     };

     const showSystemMessage = () => {
          if (_.isArray(systemMessages)) {
               return systemMessages.map((obj, index, collection) => {
                    if (obj.showOn === '0' || obj.showOn === '1' || obj.showOn === '2') {
                         return <DisplaySystemMessage style={obj.style} message={obj.message} dismissable={obj.dismissable} id={obj.id} all={systemMessages} url={library.baseUrl} updateSystemMessages={updateSystemMessages} queryClient={queryClient} />;
                    }
               });
          }
          return null;
     };

     const decodeMessage = (string) => {
          return stripHTML(string);
     };

     return (
          <SafeAreaView style={{ flex: 1 }}>
               <Box safeArea={2} bgColor="coolGray.100" borderBottomWidth="1" _dark={{ borderColor: 'gray.600', bg: 'coolGray.700' }} borderColor="coolGray.200" flexWrap="nowrap">
                    {showSystemMessage()}
                    <ScrollView horizontal>{actionButtons()}</ScrollView>
               </Box>
               <Center>
                    <AlertDialog leastDestructiveRef={renewConfirmationRef} isOpen={renewConfirmationIsOpen} onClose={onRenewConfirmationClose}>
                         <AlertDialog.Content>
                              <AlertDialog.Header>{renewConfirmationResponse?.title ? renewConfirmationResponse.title : 'Unknown Error'}</AlertDialog.Header>
                              <AlertDialog.Body>{renewConfirmationResponse?.message ? decodeMessage(renewConfirmationResponse.message) : 'Unable to renew checkout for unknown error. Please contact the library.'}</AlertDialog.Body>
                              <AlertDialog.Footer>
                                   <Button.Group space={3}>
                                        <Button variant="outline" colorScheme="primary" onPress={() => setRenewConfirmationIsOpen(false)}>
                                             {getTermFromDictionary(language, 'close_window')}
                                        </Button>
                                        <Button
                                             isLoading={confirmingRenewal}
                                             isLoadingText={getTermFromDictionary(language, 'renewing', true)}
                                             onPress={async () => {
                                                  setConfirmingRenewal(true);

                                                  if (renewConfirmationResponse.renewType === 'all') {
                                                       await confirmRenewAllCheckouts(library.baseUrl, language).then(async (result) => {
                                                            queryClient.invalidateQueries({ queryKey: ['user', library.baseUrl, language] });
                                                            queryClient.invalidateQueries({ queryKey: ['checkouts', user.id, library.baseUrl, language] });

                                                            setRenewConfirmationIsOpen(false);
                                                            setConfirmingRenewal(false);
                                                       });
                                                  } else {
                                                       await confirmRenewCheckout(renewConfirmationResponse.barcode, renewConfirmationResponse.recordId, renewConfirmationResponse.source, renewConfirmationResponse.itemId, library.baseUrl, renewConfirmationResponse.userId).then(async (result) => {
                                                            queryClient.invalidateQueries({ queryKey: ['user', library.baseUrl, language] });
                                                            queryClient.invalidateQueries({ queryKey: ['checkouts', user.id, library.baseUrl, language] });

                                                            setRenewConfirmationIsOpen(false);
                                                            setConfirmingRenewal(false);
                                                       });
                                                  }
                                             }}>
                                             {renewConfirmationResponse?.action ? renewConfirmationResponse.action : 'Renew Item'}
                                        </Button>
                                   </Button.Group>
                              </AlertDialog.Footer>
                         </AlertDialog.Content>
                    </AlertDialog>
               </Center>
               <FlatList data={checkouts} ListEmptyComponent={noCheckouts}
                    renderItem={({ item }) => <MyCheckout data={item} reloadCheckouts={reloadCheckouts} checkoutSource={checkoutSource} />}
                    keyExtractor={(item, index) => index.toString()} contentContainerStyle={{ paddingBottom: 30 }} setRenewConfirmationIsOpen={setRenewConfirmationIsOpen} setRenewConfirmationResponse={setRenewConfirmationResponse} />
          </SafeAreaView>
     );
};
