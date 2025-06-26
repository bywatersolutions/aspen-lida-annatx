import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { Button, Box, ButtonGroup, ButtonIcon, ButtonText, ButtonSpinner } from '@gluestack-ui/themed';
import React from 'react';

// custom components and helper files
import { HoldsContext, LibraryBranchContext, LibrarySystemContext, ThemeContext, UserContext } from '../../../context/initialContext';
import { completeAction } from '../../../util/recordActions';
import { HoldPrompt } from './HoldPrompt';

export const PlaceHold = (props) => {
     const queryClient = useQueryClient();
     const {
          id,
          type,
          volumeInfo,
          volumeId,
          volumeName,
          title,
          record,
          holdTypeForFormat,
          variationId,
          prevRoute,
          response,
          setResponse,
          responseIsOpen,
          setResponseIsOpen,
          onResponseClose,
          cancelResponseRef,
          holdConfirmationResponse,
          setHoldConfirmationResponse,
          holdConfirmationIsOpen,
          setHoldConfirmationIsOpen,
          onHoldConfirmationClose,
          cancelHoldConfirmationRef,
          language,
          holdSelectItemResponse,
          setHoldSelectItemResponse,
          holdItemSelectIsOpen,
          setHoldItemSelectIsOpen,
          onHoldItemSelectClose,
          cancelHoldItemSelectRef,
          userHasAlternateLibraryCard,
          shouldPromptAlternateLibraryCard,
     } = props;
     const { user, updateUser, accounts, locations } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { location } = React.useContext(LibraryBranchContext);
     const [loading, setLoading] = React.useState(false);
     const { holds, updateHolds } = React.useContext(HoldsContext);
     const { theme } = React.useContext(ThemeContext);

     let userPickupLocationId = user.pickupLocationId ?? user.homeLocationId;
     if (_.isNumber(user.pickupLocationId)) {
          userPickupLocationId = _.toString(user.pickupLocationId);
     }

     let pickupLocation = '';
     if (_.size(locations) > 1) {
          const userPickupLocation = _.filter(locations, { locationId: userPickupLocationId });
          if (!_.isUndefined(userPickupLocation && !_.isEmpty(userPickupLocation))) {
               pickupLocation = userPickupLocation[0];
               if (_.isObject(pickupLocation)) {
                    pickupLocation = pickupLocation.code;
               }
          }
     } else {
          pickupLocation = locations[0];
          if (_.isObject(pickupLocation)) {
               pickupLocation = pickupLocation.code;
          }
     }

     console.log(pickupLocation);

     const [sublocation, setSublocation] = React.useState(null);

     //console.log(pickupLocation);
     let promptForHoldNotifications = user.promptForHoldNotifications ?? false;

     let loadHoldPrompt = false;
     if ((volumeInfo.numItemsWithVolumes >= 1 && _.isEmpty(volumeId)) || _.size(accounts) > 0 || _.size(locations) > 1 || promptForHoldNotifications || holdTypeForFormat === 'item' || holdTypeForFormat === 'either' || (shouldPromptAlternateLibraryCard && !userHasAlternateLibraryCard)) {
          loadHoldPrompt = true;
     }

     //Check to see if the title is already on hold for the patron
     //console.log("holdTypeForFormat = " + holdTypeForFormat);
     //console.log("record = " + record);
     let alreadyOnHold = false;
     holds.forEach(holdSection =>  {
          holdSection.data.forEach(hold => {
               if ((hold.source + ":" + hold.sourceId) == record) {
                    alreadyOnHold = true;
               }
          });
     });
     //console.log("Already on hold = " + alreadyOnHold);
     if (alreadyOnHold) {
          loadHoldPrompt = true;
     }


     if(user.rememberHoldPickupLocation) {
          let userPickupLocationId = user.pickupLocationId ?? user.homeLocationId;
          if (_.isNumber(user.pickupLocationId)) {
               userPickupLocationId = _.toString(user.pickupLocationId);
          }
          const userPickupLocation = _.filter(locations, { locationId: userPickupLocationId });
          let pickupLocation = '';
          if (!_.isUndefined(userPickupLocation && !_.isEmpty(userPickupLocation))) {
               pickupLocation = userPickupLocation[0];
               if (_.isObject(pickupLocation)) {
                    pickupLocation = pickupLocation.locationId;
               }
          } else {
               // soft check on valid pickup location, if nothing is returned out of the locations array, its probably invalid
          }

          if ((volumeInfo.numItemsWithVolumes >= 1 && _.isEmpty(volumeId)) || _.size(accounts) > 0 || promptForHoldNotifications || holdTypeForFormat === 'item' || holdTypeForFormat === 'either' || (shouldPromptAlternateLibraryCard && !userHasAlternateLibraryCard)) {
               loadHoldPrompt = true;
          } else {
               loadHoldPrompt = false;
          }
     }


     if (loadHoldPrompt) {
          return (
               <HoldPrompt
                    language={language}
                    id={record}
                    title={title}
                    action={type}
                    holdTypeForFormat={holdTypeForFormat}
                    variationId={variationId}
                    volumeInfo={volumeInfo}
                    volumeId={volumeId}
                    volumeName={volumeName}
                    prevRoute={prevRoute}
                    isEContent={false}
                    setResponseIsOpen={setResponseIsOpen}
                    responseIsOpen={responseIsOpen}
                    onResponseClose={onResponseClose}
                    cancelResponseRef={cancelResponseRef}
                    response={response}
                    setResponse={setResponse}
                    setHoldConfirmationIsOpen={setHoldConfirmationIsOpen}
                    holdConfirmationIsOpen={holdConfirmationIsOpen}
                    onHoldConfirmationClose={onHoldConfirmationClose}
                    cancelHoldConfirmationRef={cancelHoldConfirmationRef}
                    holdConfirmationResponse={holdConfirmationResponse}
                    setHoldConfirmationResponse={setHoldConfirmationResponse}
                    setHoldItemSelectIsOpen={setHoldItemSelectIsOpen}
                    holdItemSelectIsOpen={holdItemSelectIsOpen}
                    onHoldItemSelectClose={onHoldItemSelectClose}
                    cancelHoldItemSelectRef={cancelHoldItemSelectRef}
                    holdSelectItemResponse={holdSelectItemResponse}
                    setHoldSelectItemResponse={setHoldSelectItemResponse}
                    alreadyOnHold={alreadyOnHold}
               />
          );
     } else {
          // The hold can be placed without additional prompting to the user.
          // See HoldPrompt.js for actions if a pickup location etc. is needed.
          return (
               <>
                    <Button
                         size="md"
                         bgColor={theme['colors']['primary']['500']}
                         variant="solid"
                         minWidth="100%"
                         maxWidth="100%"
                         onPress={async () => {
                              setLoading(true);
                              await completeAction(record, type, user.id, null, null, pickupLocation, sublocation, library.baseUrl, volumeId, 'default').then(async (ilsResponse) => {
                                   setResponse(ilsResponse);

                                   if (ilsResponse?.confirmationNeeded && ilsResponse.confirmationNeeded) {
                                        setHoldConfirmationResponse({
                                             message: ilsResponse.api?.message ?? ilsResponse.message,
                                             title: ilsResponse.api?.title ?? ilsResponse.title,
                                             confirmationNeeded: ilsResponse.confirmationNeeded ?? false,
                                             confirmationId: ilsResponse.confirmationId ?? null,
                                             recordId: record ?? null,
                                        });
                                   }
                                   if (ilsResponse?.shouldBeItemHold && ilsResponse.shouldBeItemHold) {
                                        setHoldSelectItemResponse({
                                             message: ilsResponse.message,
                                             title: 'Select an Item',
                                             patronId: user.id,
                                             pickupLocation: pickupLocation,
                                             bibId: record ?? null,
                                             items: ilsResponse.items ?? [],
                                        });
                                   }

                                   if (ilsResponse?.success === true || ilsResponse?.success === 'true') {
                                        //Refresh the hold and user if the hold was successful
                                        queryClient.invalidateQueries({ queryKey: ['holds', user.id, library.baseUrl, language] });
                                        queryClient.invalidateQueries({ queryKey: ['user', library.baseUrl, language] });

                                        const timeoutId = setTimeout(() => {
                                             // Also refresh in 45 seconds for Sierra since hold can take a minute to show up on the account
                                             queryClient.invalidateQueries({ queryKey: ['holds', user.id, library.baseUrl, language] });
                                             queryClient.invalidateQueries({ queryKey: ['user', library.baseUrl, language] });
                                        }, 45 * 1000);
                                   }

                                   setLoading(false);
                                   if (ilsResponse?.confirmationNeeded && ilsResponse.confirmationNeeded) {
                                        setHoldConfirmationIsOpen(true);
                                   } else if (ilsResponse?.shouldBeItemHold && ilsResponse.shouldBeItemHold) {
                                        setHoldItemSelectIsOpen(true);
                                   } else {
                                        setResponseIsOpen(true);
                                   }
                              });
                         }}>
                         {loading ? (
                              <ButtonSpinner color={theme['colors']['primary']['500-text']} />
                         ) : (
                              <ButtonText color={theme['colors']['primary']['500-text']} textAlign="center">
                                   {title}
                              </ButtonText>
                         )}
                    </Button>
               </>
          );
     }
};
