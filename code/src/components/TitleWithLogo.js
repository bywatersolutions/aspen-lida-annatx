import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { LibrarySystemContext, ThemeContext } from '../context/initialContext';
import { ChevronLeftIcon, CloseIcon, Pressable, Icon } from 'native-base';
import { View, Image, StyleSheet, Text, useColorMode, HStack, VStack, Box } from '@gluestack-ui/themed';
import { Platform, useWindowDimensions } from 'react-native';
import Constants from 'expo-constants';

let topPadding = Constants.statusBarHeight;
if (Platform.OS === 'android') {
     topPadding = 0;
}

const HeaderLogoBar = (props) => {
     const { theme, colorMode } = React.useContext(ThemeContext);
     const { library } = React.useContext(LibrarySystemContext);
     const { width, height } = useWindowDimensions();
     if (library.headerLogoApp){
          const localBrandingLogoUri = library.headerLogoApp;

          //Assume an image that is 1536 x 200
          const colorMode = useColorMode();
          let backgroundColor = '#FFFFFF';
          if (library.headerLogoBackgroundColorApp !== undefined) {
               backgroundColor = library.headerLogoBackgroundColorApp;
          }

          let headerLogoAlignment = 'center';
          if (library.headerLogoAlignmentApp !== undefined) {
               if (library.headerLogoAlignmentApp == 1) {
                    headerLogoAlignment = 'flex-start';
               }else if (library.headerLogoAlignmentApp == 2) {
                    headerLogoAlignment = 'center';
               }else if (library.headerLogoAlignmentApp == 3) {
                     headerLogoAlignment = 'flex-end';
               }
          }

          let originalHeight = library.headerLogoHeight ?? 200;
          let originalWidth = library.headerLogoWidth ?? 1536;

          var dims = logoSize(width, 50, originalWidth,originalHeight);
          var scaledImageWidth = dims.width;
          var scaledImageHeight = dims.height;

          return (
               <HStack backgroundColor={backgroundColor} safeAreaTop='1' safeAreaBottom='1' justifyContent={headerLogoAlignment} flexDirection='row' height={scaledImageHeight}>
                         <Image source={{uri: localBrandingLogoUri}} alt={library.displayName} placeholder="" width={scaledImageWidth} height={scaledImageHeight} resizeMode='contain' />
               </HStack>
          );
     }else{
          return null;
     }
};

export default function TitleWithLogo(props) {
     const { theme } = React.useContext(ThemeContext);

     const navigation = useNavigation();
     const hideBack = props.hideBack ?? false;

     return (
          <VStack mt={topPadding}>
               <HeaderLogoBar />
               <HStack safeAreaLeft={7} safeAreaRight={7} safeAreaBottom={2} safeAreaTop={2} alignItems="left" backgroundColor={theme['colors']['primary']['base']} pt={2} pb={2}>
                    {navigation.canGoBack() && !hideBack && (
                       <Pressable onPress={() => navigation.goBack()} mr={3} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} >
                            <ChevronLeftIcon size={5} left={3} color={theme['colors']['primary']['baseContrast']} />
                       </Pressable>
                     )}
                    <Text left={5} color={theme['colors']['primary']['baseContrast']} fontSize={18} lineHeight={22} fontWeight='bold' numberOfLines={1} ellipsizeMode="tail">{props.title}</Text>
               </HStack>
          </VStack>
     );
}

function logoSize(maxWidth, maxHeight, width, height) {
  var maxWidth = maxWidth;
  var maxHeight = maxHeight;

  if (width >= height) {
    var ratio = maxWidth / width;
    var h = Math.ceil(ratio * height);

    if (h > maxHeight) {
      // Too tall, resize
      var ratio = maxHeight / height;
      var w = Math.ceil(ratio * width);
      var ret = {
        'width': w,
        'height': maxHeight
      };
    } else {
      var ret = {
        'width': maxWidth,
        'height': h
      };
    }

  } else {
    var ratio = maxHeight / height;
    var w = Math.ceil(ratio * width);

    if (w > maxWidth) {
      var ratio = maxWidth / width;
      var h = Math.ceil(ratio * height);
      var ret = {
        'width': maxWidth,
        'height': h
      };
    } else {
      var ret = {
        'width': w,
        'height': maxHeight
      };
    }
  }

  return ret;
}
