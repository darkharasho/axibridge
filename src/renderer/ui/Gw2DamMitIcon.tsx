import { resolvePublicAssetPath } from './resolvePublicAssetPath';

type Gw2DamMitIconProps = {
    className?: string;
};

export const Gw2DamMitIcon = ({ className = '' }: Gw2DamMitIconProps) => {
    const iconPath = resolvePublicAssetPath('svg/custom-icons/dam_mit.svg');
    return (
        <span
            aria-hidden="true"
            className={`inline-block shrink-0 ${className}`.trim()}
            style={{
                backgroundColor: 'currentColor',
                maskImage: `url(${iconPath})`,
                WebkitMaskImage: `url(${iconPath})`,
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskPosition: 'center',
                maskSize: 'contain',
                WebkitMaskSize: 'contain'
            }}
        />
    );
};
