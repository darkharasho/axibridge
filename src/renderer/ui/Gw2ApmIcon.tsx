import { resolvePublicAssetPath } from './resolvePublicAssetPath';

type Gw2ApmIconProps = {
    className?: string;
};

export const Gw2ApmIcon = ({ className = '' }: Gw2ApmIconProps) => {
    const iconPath = resolvePublicAssetPath('svg/custom-icons/mouse.svg');
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
