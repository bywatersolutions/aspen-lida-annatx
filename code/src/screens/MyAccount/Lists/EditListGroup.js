import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { LanguageContext, LibrarySystemContext, ThemeContext, UserContext } from '../../../context/initialContext';
import { Button, ButtonGroup, ButtonIcon, ButtonText, Center, CloseIcon, Heading, Icon, Modal, ModalBackdrop, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader } from '@gluestack-ui/themed';
import { MaterialIcons } from '@expo/vector-icons';
import { getTermFromDictionary } from '../../../translations/TranslationService';

export const EditListGroup = (props) => {
     const queryClient = useQueryClient();
     const { data, listGroupId } = props;
     const navigation = useNavigation();
     const { user } = React.useContext(UserContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { language } = React.useContext(LanguageContext);
     const { textColor, theme, colorMode } = React.useContext(ThemeContext);
     const [showModal, setShowModal] = React.useState(false);
     const [loading, setLoading] = React.useState(false);

     const [title, setTitle] = React.useState(data.title);

     const toggle = () => {
          setShowModal(!showModal);
     };

     return (
          <Center>
               <Button onPress={toggle} size="sm" bgColor={theme['colors']['primary']['500']}>
                    <ButtonIcon color={theme['colors']['primary']['500-text']} as={MaterialIcons} name="edit" mr="$1" />
                    <ButtonText color={theme['colors']['primary']['500-text']}>{getTermFromDictionary(language, 'rename_list_group')}</ButtonText>
               </Button>
               <Modal isOpen={showModal} onClose={toggle} size="full" avoidKeyboard>
                    <ModalBackdrop />
                    <ModalContent maxWidth="90%"  bgColor={colorMode === 'light' ? theme['colors']['warmGray']['50'] : theme['colors']['coolGray']['700']}>
                         <ModalHeader>
                              <Heading size="md" color={textColor}>{getTermFromDictionary(language, 'rename_list_group')}</Heading>
                              <ModalCloseButton hitSlop={{ top: 30, bottom: 30, left: 30, right: 30 }}>
                                   <Icon as={CloseIcon} color={textColor} />
                              </ModalCloseButton>
                         </ModalHeader>
                         <ModalBody>
                         </ModalBody>
                         <ModalFooter>
                              <ButtonGroup>
                                   <Button variant="outline" onPress={toggle} borderColor={theme['colors']['primary']['500']}>
                                        <ButtonText color={theme['colors']['primary']['500']}>{getTermFromDictionary(language, 'close_window')}</ButtonText>
                                   </Button>
                              </ButtonGroup>
                         </ModalFooter>
                    </ModalContent>
               </Modal>
          </Center>
     );
}