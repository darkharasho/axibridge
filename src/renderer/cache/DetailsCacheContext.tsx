import React, { createContext } from 'react';
import { DetailsCache } from './DetailsCache';

export const DetailsCacheContext = createContext<DetailsCache | null>(null);

export function DetailsCacheProvider({
    cache,
    children,
}: {
    cache: DetailsCache;
    children: React.ReactNode;
}) {
    return (
        <DetailsCacheContext.Provider value={cache}>
            {children}
        </DetailsCacheContext.Provider>
    );
}
