// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import DatabaseManager from '@database/manager';
import {prepareDeleteTeam, getMyTeamById, removeTeamFromTeamHistory} from '@queries/servers/team';
import {logError} from '@utils/log';

export async function removeUserFromTeam(serverUrl: string, teamId: string) {
    try {
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const myTeam = await getMyTeamById(database, teamId);
        if (myTeam) {
            const team = await myTeam.team.fetch();
            if (!team) {
                throw new Error('Team not found');
            }
            const models = await prepareDeleteTeam(team);
            const system = await removeTeamFromTeamHistory(operator, team.id, true);
            if (system) {
                models.push(...system);
            }
            if (models.length) {
                await operator.batchRecords(models);
            }
        }

        return {error: undefined};
    } catch (error) {
        logError('Failed removeUserFromTeam', error);
        return {error};
    }
}
export async function addRecentTeamSearch(serverUrl: string, teamId: string, terms: string) {
    try {
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const myTeam = await getMyTeamById(database, teamId);
        if (myTeam) {
            if (!myTeam) {
                return [];
            }

            // Models
            // const teamSearchHistory = await getTeamSearchHistoryByTeamId(database, teamId);
            // const teamSearchSet = new Set(teamSearchHistory);

            const newSearch: TeamSearchHistory = {
                created_at: 1445538153952,
                display_term: 'displayterm2',
                term: terms,
                team_id: teamId,
            };

            // this works
            const newSearchModel = await operator.handleTeamSearchHistory({teamSearchHistories: [newSearch], prepareRecordsOnly: false});

        return {error: undefined};
    } catch (error) {
        // eslint-disable-next-line no-console
        console.log('Failed removeUserFromTeam', error);
        return {error};
    }
}

        return {error: undefined};
    } catch (error) {
        // eslint-disable-next-line no-console
        console.log('Failed removeUserFromTeam', error);
        return {error};
    }
}

