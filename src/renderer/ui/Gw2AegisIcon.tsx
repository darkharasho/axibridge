import { resolvePublicAssetPath } from './resolvePublicAssetPath';

type Gw2AegisIconProps = {
    className?: string;
};

export const Gw2AegisIcon = ({ className = '' }: Gw2AegisIconProps) => {
    const iconPath = resolvePublicAssetPath('svg/custom-icons/gw2_aegis.svg');
    return (
        <span
            aria-hidden="true"
            className={`inline-block shrink-0 ${className}`.trim()}
            style={{
                backgroundColor: 'currentColor',
                maskImage: `url("${iconPath}")`,
                WebkitMaskImage: `url("${iconPath}")`,
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskPosition: 'center',
                maskSize: 'contain',
                WebkitMaskSize: 'contain',
                maskMode: 'alpha'
            }}
        />
    );
};
