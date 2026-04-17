import React from 'react';
import { ReplayView } from '../map/ReplayView';

interface ReplaySectionProps {
    fights: any[];
}

export const ReplaySection: React.FC<ReplaySectionProps> = ({ fights }) => {

    return (
        <div id="replay" style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
            <ReplayView fights={fights} style={{ flex: 1, minWidth: 0 }} />
        </div>
    );
};

export default ReplaySection;
