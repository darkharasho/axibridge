import { resolvePublicAssetPath } from './resolvePublicAssetPath';

type CommanderTagIconProps = {
    className?: string;
};

export const CommanderTagIcon = ({ className }: CommanderTagIconProps) => {
    const iconUrl = resolvePublicAssetPath('svg/commander_tag_outline.svg');

    return (
        <span
            aria-hidden="true"
            className={className}
            style={{
                display: 'inline-block',
                backgroundColor: 'currentColor',
                maskImage: `url("${iconUrl}")`,
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
                maskSize: 'contain',
                WebkitMaskImage: `url("${iconUrl}")`,
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                WebkitMaskSize: 'contain'
            }}
        />
    );
};
