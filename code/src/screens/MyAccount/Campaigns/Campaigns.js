import React, { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Platform, SafeAreaView, Share } from "react-native";
import { 
  Actionsheet, 
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
  ActionsheetItem,
  ActionsheetItemText,
  Box, 
  Button, 
  ButtonText,
  Center, 
  FlatList, 
  HStack, 
  Pressable, 
  ScrollView, 
  Text, 
  VStack,
  Select,
  SelectTrigger,
  SelectInput,
  SelectIcon,
  SelectPortal,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectItem,
  ChevronDownIcon,
  CheckIcon
} from '@gluestack-ui/themed';
import { fetchCampaigns, unenrollCampaign, enrollCampaign, optIntoCampaignEmails, optUserOutOfCampaignLeaderboard, optUserInToCampaignLeaderboard} from '../../../util/api/user';
import { getTermFromDictionary } from '../../../translations/TranslationService';
import { UserInterfaceIdiom } from 'expo-constants';
import { LanguageContext, LibrarySystemContext, UserContext } from '../../../context/initialContext';
import { filter } from 'lodash';
import { Image } from 'expo-image';
import { setCurrentClient } from '@sentry/react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// Constants
const PAGE_SIZE = 20;
const FILTER_OPTIONS = [
  { value: 'enrolled', labelKey: 'enrolled_campaigns' },
  { value: 'linkedUserCampaigns', labelKey: 'linked_user_campaigns' },
  { value: 'active', labelKey: 'active_campaigns' },
  { value: 'upcoming', labelKey: 'upcoming_campaigns' },
  { value: 'past', labelKey: 'past_campaigns' },
  { value: 'pastEnrolled', labelKey: 'past_enrolled_campaigns' }
];

const EMPTY_MESSAGES = {
  active: 'no_active_campaigns',
  enrolled: 'no_enrolled_campaigns',
  past: 'no_past_campaigns',
  upcoming: 'no_upcoming_campaigns',
  pastEnrolled: 'no_past_enrolled_campaigns',
  linkedUserCampaigns: 'no_linked_user_campaigns',
  default: 'no_campaigns'
};

export const MyCampaigns = () => {
	const navigation = useNavigation();
	const queryClient = useQueryClient();
	const { user} = React.useContext(UserContext);
	const { library } = React.useContext(LibrarySystemContext);
	const { language } = React.useContext(LanguageContext);

	const [isLoading, setLoading] = React.useState(false);
	const [filterBy, setFilterBy] = React.useState('enrolled');
	const [page, setPage] = React.useState(1);
	const [campaigns, updateCampaigns] = React.useState([]);
	const [expandedCampaigns, setExpandedCampaigns] = React.useState({});
	const [selectedCampaign, setSelectedCampaign] = React.useState(null);
	const [showActionSheet, setShowActionSheet] = React.useState(false);
	const [selectedLinkedUserId, setSelectedLinkedUserId] = React.useState(null);

	React.useLayoutEffect(() => {
		navigation.setOptions({
			headerLeft: () => <Box />,
		});
	}, [navigation]);

	//Utility Functions
	/*const buildImageUrl = (imagePath) => {
		if (!imagePath || !library.baseUrl) return '';
		return `${library.baseUrl}${imagePath.startsWith('/') ? imagePath : '/' + imagePath}`;
	};*/
	const buildImageUrl = (imagePath) => {
		if (!imagePath || !library.baseUrl) return '';
		return library.baseUrl + imagePath;
	};

	const formatDate = (dateString) => {
		return dateString ? new Date(dateString).toLocaleDateString() : 'N/A';
	};

	const handleShareOnSocial = async (imageUrl) => {
		if (!imageUrl) return;
		
		const fileUri = FileSystem.documentDirectory + 'shared.jpg';

		try {
			const download = await FileSystem.downloadAsync(imageUrl, fileUri);
		
			if (!(await Sharing.isAvailableAsync())) {
			  console.error('Sharing is not available on this device');
			  return;
			}
		
			await Sharing.shareAsync(download.uri);
		} catch (err) {
			console.error('Sharing failed:', err);
		}
	};

	const groupByLinkedUser = (campaigns) => {
		if (!Array.isArray(campaigns)) return {};
		
		return campaigns.reduce((acc, campaign) => {
			if (!campaign) return acc;
			
			const userName = campaign.linkedUserName || 'UnknownUser';
			const userId = campaign.linkedUserId;

			if (!acc[userName]) {
				acc[userName] = { userId: userId, campaigns: [] };
			}

			acc[userName].campaigns.push({
				...campaign,
				linkedUserId: userId,
			});
			return acc;
		}, {});
	};

	// Data fetching
	const { status, data, error, isFetching, refetch} = useQuery(
		['all_campaigns', library.baseUrl, language, filterBy], 
		() => fetchCampaigns(page, PAGE_SIZE, filterBy, library.baseUrl), 
		{
			initialData: { campaigns: campaigns },
			keepPreviousData: true,
			staleTime: 1000,
			onSuccess: (data) => {
				if (data && data.campaigns) {
					updateCampaigns(data.campaigns);
				}
			},
		  	onSettle: () => setLoading(false),  
		}
	);

	useEffect(() => {
		queryClient.invalidateQueries(['all_campaigns']);
	}, [filterBy]);

	// Action handlers
	const handleEnrollUnenroll = async () => {
		if (!selectedCampaign) return;

		try {
			const linkedUserId = selectedLinkedUserId;
			
			if (selectedCampaign.enrolled) {
				await unenrollCampaign(selectedCampaign.id, linkedUserId, filterBy, library.baseUrl);
			} else {
				await enrollCampaign(selectedCampaign.id, linkedUserId, filterBy, library.baseUrl);
			}

			await refetch();
			handleCloseActions();
		} catch (error) {
			console.log("Error in enroll / unenroll: ", error);
		}
	};

	const handleEmailNotificationOptions = async () => {
		if (!selectedCampaign) return;

		try {
			const linkedUserId = selectedLinkedUserId;
			const optIn = selectedCampaign.optInToCampaignEmailNotifications ? 0 : 1;
			
			await optIntoCampaignEmails(selectedCampaign.id, linkedUserId, filterBy, optIn, library.baseUrl);
			
			await refetch();
			handleCloseActions();
		} catch (error) {
			console.log("Error in opt in / out of email notifications: ", error);
		}
	};

	const handleLeaderboardOptions = async () => {
		if (!selectedCampaign) return;

		try {
			const linkedUserId = selectedLinkedUserId;

			if (selectedCampaign.optInToCampaignLeaderboard) {
				await optUserOutOfCampaignLeaderboard(selectedCampaign.id, linkedUserId, filterBy, library.baseUrl);
			} else {
				await optUserInToCampaignLeaderboard(selectedCampaign.id, linkedUserId, filterBy, library.baseUrl);
			}

			await refetch();
			handleCloseActions();
		} catch (error) {
			console.log("Error in opt in / out of leaderboard: ", error);
		}
	};
	
	const toggleExpanded = (id) => {
		setExpandedCampaigns((prev) => ({
			...prev,
			[id]: !prev[id],
		}));
	};

	const handleOpenActions = (item, linkedUserId) => {
		setSelectedCampaign(item);
		setSelectedLinkedUserId(linkedUserId);
		setShowActionSheet(true);
	};

	const handleCloseActions = () => {
		setSelectedCampaign(null);
		setSelectedLinkedUserId(null);
		setShowActionSheet(false);
	};

	// Reusable Components
	const RewardImage = ({ imageUrl, rewardName, canShare, onShare }) => {
		if (!imageUrl) return null;

		return (
			<VStack space="sm">
				<Image
					source={{ uri: imageUrl }}
					contentFit="contain"
					style={{ width: 100, height: 100 }}
					alt={rewardName || 'Reward image'}
					onError={(error) => console.log('Image failed to load:', error, imageUrl)}
					onLoad={() => console.log('Image loaded successfully:', imageUrl)}
				/>
				

				{canShare && onShare && (
					<Pressable onPress={() => onShare(imageUrl)}>
						<Text color="$gray500">Share on Social Media</Text>
					</Pressable>
				)}
			</VStack>
		);
	};

	const RewardDisplay = ({ item, imageUrl, type = 'campaign' }) => {
		const displayName = item.displayName === 1;
		const hasImage = item.rewardType === 1 && item.rewardExists === 1 && item.rewardImage;
		const rewardName = item.rewardName || 'No Reward';
		
		const canShare = type === 'campaign' 
			? (item.campaignRewardGiven || (item.awardAutomatically && item.campaignIsComplete))
			: type === 'milestone'
			? (item.milestoneRewardGiven || (item.awardAutomatically && item.milestoneIsComplete))
			: (item.rewardGiven || (item.awardAutomatically && item.extraCreditActivityComplete));

		return (
			<Box flex={type === 'campaign' ? 3 : 1}>
				{displayName && rewardName && (
					<Text color={type === 'campaign' ? "$emerald600" : "$textLight900"}>
						{rewardName}
					</Text>
				)}
				{hasImage && imageUrl && (
					<RewardImage 
						imageUrl={imageUrl}
						rewardName={rewardName}
						canShare={canShare}
						onShare={handleShareOnSocial}
					/>
				)}
			</Box>
		);
	};

	const ActivityTable = ({ items, title, type }) => {
		if (!Array.isArray(items) || items.length === 0) {
			return (
				<Text color="$gray400" fontStyle="italic">
					No {title.toLowerCase()} available
				</Text>
			);
		}

		return (
			<Box mt="$4">
				<Text fontWeight="$bold" fontSize="$md" mb="$2">
					{title}
				</Text>
				<VStack space="md">
					<HStack justifyContent="space-between" pb="$1" borderBottomWidth={1}>
						<Text flex={2} fontWeight="$bold">Name</Text>
						<Text flex={1} fontWeight="$bold">Goal</Text>
						<Text flex={1} fontWeight="$bold">Reward</Text>
					</HStack>

					{items.map((item, i) => {
						if (!item) return null;
						
						const imageUrl = buildImageUrl(item.rewardImage);

						return(
							<HStack 
								key={i} 
								justifyContent="space-between"
								alignItems="center"
							>
								<Text flex={2}>
									{item.name || ''}
								</Text>
								<Text flex={1}>
									{String(item.completedGoals || 0)} / {String(item.totalGoals || 0)}
								</Text>
								<RewardDisplay 
									item={item}
									imageUrl={imageUrl}
									type={type}
								/>
							</HStack>
						);
					})}
				</VStack>
			</Box>
		);
	};

	const renderCampaignItem = ({ item, onOpenActions, onToggle, expanded }) => {
		if (!item) return null;

		const startDate = formatDate(item.startDate);
		const endDate = formatDate(item.endDate);
		const campaignImageUrl = buildImageUrl(item.badgeImage);
		console.log('Generated URL:', campaignImageUrl);
console.log('Original item.badgeImage:', item.badgeImage);
console.log('library.baseUrl:', library.baseUrl);

		return (
			<VStack space="md" px="$4" py="$3" key={item.id}>
				<HStack justifyContent="space-between" borderBottomWidth={1} pb="$2">
					<Text flex={2} fontWeight="$bold">Campaign Name</Text>
					<Text flex={3} fontWeight="$bold">Reward</Text>
					<Text flex={2} fontWeight="$bold">Dates</Text>
					<Text flex={1} fontWeight="$bold"> </Text>
					<Text flex={1} fontWeight="$bold"> </Text>
				</HStack>
				
				<HStack
					justifyContent="space-between"
					alignItems="center"
					py="$2"
					borderBottomWidth={0.5}
					borderColor="$coolGray200"
				>
					<Text flex={2}>
						{item.name || ''}
					</Text>
					<RewardDisplay 
						item={item}
						imageUrl={campaignImageUrl}
						type="campaign"
					/>
					<Text flex={2} color="$gray500">
						{startDate} - {endDate}
					</Text>
					<Button
						onPress={onToggle}
						variant="link"
						flex={1}
						accessibilityLabel={expanded ? "Collapse campaign details" : "Expand campaign details"}
					>
						<ButtonText>
							{expanded ? "▲" : "▼"}
						</ButtonText>
					</Button>
					<Button 
						size="sm"
						flex={1}
						onPress={() => onOpenActions(item, filterBy === 'linkedUserCampaigns' ? item.linkedUserId : null)}
						accessibilityLabel={`Open actions menu for ${item.name || 'campaign'}`}
					>
						<ButtonText>Actions</ButtonText>
					</Button>
				</HStack>

				{expanded && (
					<Box px="$2" py="$2" bg="$coolGray100" borderRadius="$md">
						<ActivityTable 
							items={item.milestones}
							title="Milestones"
							type="milestone"
						/>
						<ActivityTable 
							items={item.extraCreditActivities}
							title="Extra Credit Activities"
							type="activity"
						/>
					</Box>
				)}
			</VStack>
		);
	};

	const renderActionSheet = () => {
		if (!selectedCampaign) return null;

		return (
			<Actionsheet isOpen={showActionSheet} onClose={handleCloseActions}>
				<ActionsheetBackdrop />
				<ActionsheetContent>
					<ActionsheetDragIndicatorWrapper>
						<ActionsheetDragIndicator />
					</ActionsheetDragIndicatorWrapper>
					
					{(selectedCampaign?.canEnroll || selectedCampaign?.enrolled) && (
						<ActionsheetItem onPress={handleEnrollUnenroll}>
							<ActionsheetItemText>
								{selectedCampaign?.enrolled ? 'Unenroll' : 'Enroll'}
							</ActionsheetItemText>
						</ActionsheetItem>
					)}
					{filterBy !== 'linkedUserCampaigns' && (
						<React.Fragment>
							<ActionsheetItem onPress={handleEmailNotificationOptions}>
								<ActionsheetItemText>
									{selectedCampaign?.optInToCampaignEmailNotifications ? 'Opt Out of Notifications' : 'Opt in to Notifications'}
								</ActionsheetItemText>
							</ActionsheetItem>
							{library?.campaignLeaderboardDisplay === 'displayUser' && (
								<ActionsheetItem onPress={handleLeaderboardOptions}>
									<ActionsheetItemText>
										{selectedCampaign?.optInToCampaignLeaderboard ? 'Opt Out of Leaderboard' : 'Opt in to Leaderboard'}
									</ActionsheetItemText>
								</ActionsheetItem>
							)}
						</React.Fragment>
					)}
					<ActionsheetItem onPress={handleCloseActions}>
						<ActionsheetItemText>Cancel</ActionsheetItemText>
					</ActionsheetItem>
				</ActionsheetContent>
			</Actionsheet>
		);
	};

	const EmptyComponent = () => (
		<Center mt="$5" mb="$5">
			<Text fontWeight="$bold" fontSize="$lg">
				{getTermFromDictionary(language, EMPTY_MESSAGES[filterBy] || EMPTY_MESSAGES.default)}
			</Text>
		</Center>
	);

	// Memoized values
	const campaignsData = useMemo(() => data?.campaigns || [], [data]);
	const groupedCampaigns = useMemo(() => 
		filterBy === 'linkedUserCampaigns' ? groupByLinkedUser(campaignsData) : {},
		[filterBy, campaignsData]
	);

	const getFilterLabel = (value) => {
		const option = FILTER_OPTIONS.find(opt => opt.value === value);
		return option ? getTermFromDictionary(language, option.labelKey) : 'Select Filter';
	};

	return (
		<SafeAreaView style={{ flex: 1 }}>
			<Box px="$4" py="$3" bg="$coolGray100" borderBottomWidth="$1">
				<Select
					onValueChange={(itemValue) => setFilterBy(itemValue)}
				>
					<SelectTrigger variant="outline" size="md" w="$64">
						<SelectInput 
							placeholder="Select Filter" 
							value={getFilterLabel(filterBy)}
						/>
						<SelectIcon mr="$3">
							<ChevronDownIcon />
						</SelectIcon>
					</SelectTrigger>
					<SelectPortal>
						<SelectBackdrop />
						<SelectContent>
							<SelectDragIndicatorWrapper>
								<SelectDragIndicator />
							</SelectDragIndicatorWrapper>
							{FILTER_OPTIONS.map(option => (
								<SelectItem 
									key={option.value}
									label={getTermFromDictionary(language, option.labelKey)} 
									value={option.value} 
								/>
							))}
						</SelectContent>
					</SelectPortal>
				</Select>
			</Box>

			{status === 'loading' || isFetching ? (
				<Center flex={1}>
					<Text>Loading...</Text>
				</Center>
			) : status === 'error' ? (
				<Center flex={1}>
					<Text>Error loading campaigns</Text>
				</Center>
			) : filterBy === 'linkedUserCampaigns' ? (
				<ScrollView>
					{Object.entries(groupedCampaigns).map(([userName, { userId, campaigns: groupedCampaignsList}]) => (
						<Box key={String(userId)} mb="$6">
							<Box px="$4" py="$2" bg="$coolGray200">
								<Text fontSize="$lg" fontWeight="$bold">
									Campaigns for: {String(userName)}
								</Text>
							</Box>

							{Array.isArray(groupedCampaignsList) && groupedCampaignsList.map((item) => {
								if (!item || !item.id) return null;
								
								return (
									<Box key={String(item.id)}>
										{renderCampaignItem({
											item,
											expanded: expandedCampaigns[item.id],
											onToggle: () => toggleExpanded(item.id),
											onOpenActions: () => handleOpenActions(item, userId),
										})}
									</Box>
								);
							})}
						</Box>
					))}
				</ScrollView>
			) : (
				<FlatList
					data={campaignsData}
					ListEmptyComponent={EmptyComponent}
					renderItem={({ item }) => {
						if (!item) return null;
						
						return renderCampaignItem({
							item,
							expanded: expandedCampaigns[item.id],
							onToggle: () => toggleExpanded(item.id),
							onOpenActions: () => handleOpenActions(item, filterBy === 'linkedUserCampaigns' ? item.linkedUserId : null),
						});
					}}
					keyExtractor={(item, index) => item?.id ? String(item.id) : String(index)}
					contentContainerStyle={{ paddingBottom: 30 }}
				/>
			)}

			{renderActionSheet()}
		</SafeAreaView>
	); 
}