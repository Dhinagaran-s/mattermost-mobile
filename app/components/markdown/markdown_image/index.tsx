// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useManagedConfig} from '@mattermost/react-native-emm';
import Clipboard from '@react-native-community/clipboard';
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Platform, StyleProp, StyleSheet, Text, TextStyle, View} from 'react-native';
import {LongPressGestureHandler, TapGestureHandler} from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import parseUrl from 'url-parse';

import {GalleryInit} from '@app/context/gallery';
import {useGalleryItem} from '@app/hooks/gallery';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import ProgressiveImage from '@components/progressive_image';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {bottomSheet, dismissBottomSheet} from '@screens/navigation';
import {lookupMimeType} from '@utils/file';
import {openGalleryAtIndex} from '@utils/gallery';
import {generateId} from '@utils/general';
import {calculateDimensions, getViewPortWidth, isGifTooLarge} from '@utils/images';
import {normalizeProtocol, tryOpenURL} from '@utils/url';

type MarkdownImageProps = {
    disabled?: boolean;
    errorTextStyle: StyleProp<TextStyle>;
    imagesMetadata?: Record<string, PostImage>;
    isReplyPost?: boolean;
    linkDestination?: string;
    location?: string;
    postId: string;
    source: string;
}

const ANDROID_MAX_HEIGHT = 4096;
const ANDROID_MAX_WIDTH = 4096;

const style = StyleSheet.create({
    bottomSheet: {
        flex: 1,
    },
    brokenImageIcon: {
        width: 24,
        height: 24,
    },
    container: {
        marginBottom: 5,
    },
});

const MarkdownImage = ({
    disabled, errorTextStyle, imagesMetadata, isReplyPost = false,
    linkDestination, location, postId, source,
}: MarkdownImageProps) => {
    const intl = useIntl();
    const isTablet = useIsTablet();
    const theme = useTheme();
    const managedConfig = useManagedConfig();
    const genericFileId = useRef(generateId('uid')).current;
    const tapRef = useRef<TapGestureHandler>();
    const metadata = imagesMetadata?.[source] || Object.values(imagesMetadata || {})[0];
    const [failed, setFailed] = useState(isGifTooLarge(metadata));
    const originalSize = {width: metadata?.width || 0, height: metadata?.height || 0};
    const serverUrl = useServerUrl();
    const galleryIdentifier = `${postId}-${genericFileId}-${location}`;
    const uri = useMemo(() => {
        if (source.startsWith('/')) {
            return serverUrl + source;
        }

        return source;
    }, [source, serverUrl]);

    const fileInfo = useMemo(() => {
        const link = decodeURIComponent(uri);
        let filename = parseUrl(link.substr(link.lastIndexOf('/'))).pathname.replace('/', '');
        let extension = filename.split('.').pop();
        if (extension === filename) {
            const ext = filename.indexOf('.') === -1 ? '.png' : filename.substring(filename.lastIndexOf('.'));
            filename = `${filename}${ext}`;
            extension = ext;
        }

        return {
            id: genericFileId,
            name: filename,
            extension,
            has_preview_image: true,
            post_id: postId,
            uri: link,
            width: originalSize.width,
            height: originalSize.height,
        };
    }, []);

    const handlePreviewImage = useCallback(() => {
        const item: GalleryItemType = {
            ...fileInfo,
            mime_type: lookupMimeType(fileInfo.name),
            type: 'image',
        };
        openGalleryAtIndex(galleryIdentifier, 0, [item]);
    }, []);

    const {ref, onGestureEvent, styles} = useGalleryItem(
        galleryIdentifier,
        0,
        handlePreviewImage,
    );

    const {height, width} = calculateDimensions(fileInfo.height, fileInfo.width, getViewPortWidth(isReplyPost, isTablet));

    const handleLinkPress = useCallback(() => {
        if (linkDestination) {
            const url = normalizeProtocol(linkDestination);

            const onError = () => {
                Alert.alert(
                    intl.formatMessage({
                        id: 'mobile.link.error.title',
                        defaultMessage: 'Error',
                    }),
                    intl.formatMessage({
                        id: 'mobile.link.error.text',
                        defaultMessage: 'Unable to open the link.',
                    }),
                );
            };

            tryOpenURL(url, onError);
        }
    }, [linkDestination]);

    const handleLinkLongPress = useCallback(() => {
        if (managedConfig?.copyAndPasteProtection !== 'true') {
            const renderContent = () => {
                return (
                    <View
                        testID='at_mention.bottom_sheet'
                        style={style.bottomSheet}
                    >
                        <SlideUpPanelItem
                            icon='content-copy'
                            onPress={() => {
                                dismissBottomSheet();
                                Clipboard.setString(linkDestination || source);
                            }}
                            testID='at_mention.bottom_sheet.copy_url'
                            text={intl.formatMessage({id: 'mobile.markdown.link.copy_url', defaultMessage: 'Copy URL'})}
                        />
                        <SlideUpPanelItem
                            destructive={true}
                            icon='cancel'
                            onPress={() => {
                                dismissBottomSheet();
                            }}
                            testID='at_mention.bottom_sheet.cancel'
                            text={intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'})}
                        />
                    </View>
                );
            };

            bottomSheet({
                closeButtonId: 'close-mardown-image',
                renderContent,
                snapPoints: [3 * ITEM_HEIGHT, 10],
                title: intl.formatMessage({id: 'post.options.title', defaultMessage: 'Options'}),
                theme,
            });
        }
    }, [managedConfig, intl, theme]);

    const handleOnError = useCallback(() => {
        setFailed(true);
    }, []);

    if (failed) {
        return (
            <CompassIcon
                name='file-image-broken-outline-large'
                size={24}
            />
        );
    }

    let image;
    if (height && width) {
        if (Platform.OS === 'android' && (height > ANDROID_MAX_HEIGHT || width > ANDROID_MAX_WIDTH)) {
            // Android has a cap on the max image size that can be displayed
            image = (
                <Text style={[errorTextStyle, style.container]}>
                    <FormattedText
                        id='mobile.markdown.image.too_large'
                        defaultMessage='Image exceeds max dimensions of {maxWidth} by {maxHeight}:'
                        values={{
                            maxWidth: ANDROID_MAX_WIDTH,
                            maxHeight: ANDROID_MAX_HEIGHT,
                        }}
                    />
                    {' '}
                </Text>
            );
        } else {
            image = (
                <LongPressGestureHandler
                    enabled={!disabled}
                    onGestureEvent={handleLinkLongPress}
                    waitFor={tapRef}
                >
                    <Animated.View style={[styles, {width, height}, style.container]}>
                        <TapGestureHandler
                            enabled={!disabled}
                            onGestureEvent={onGestureEvent}
                            ref={tapRef}
                        >
                            <Animated.View testID='markdown_image'>
                                <ProgressiveImage
                                    forwardRef={ref}
                                    id={fileInfo.id}
                                    defaultSource={{uri: fileInfo.uri}}
                                    onError={handleOnError}
                                    resizeMode='contain'
                                    style={{width, height}}
                                />
                            </Animated.View>
                        </TapGestureHandler>
                    </Animated.View>
                </LongPressGestureHandler>
            );
        }
    }

    if (image && linkDestination && !disabled) {
        image = (
            <TouchableWithFeedback
                onPress={handleLinkPress}
                onLongPress={handleLinkLongPress}
                style={[{width, height}, style.container]}
            >
                <ProgressiveImage
                    id={fileInfo.id}
                    defaultSource={{uri: fileInfo.uri}}
                    onError={handleOnError}
                    resizeMode='contain'
                    style={{width, height}}
                />
            </TouchableWithFeedback>
        );
    }

    return (
        <GalleryInit galleryIdentifier={galleryIdentifier}>
            <Animated.View testID='markdown_image'>
                {image}
            </Animated.View>
        </GalleryInit>
    );
};

export default MarkdownImage;