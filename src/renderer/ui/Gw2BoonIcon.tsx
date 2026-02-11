type Gw2BoonIconProps = {
    className?: string;
};

export const Gw2BoonIcon = ({ className = '' }: Gw2BoonIconProps) => (
    <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`.trim()}
        style={{
            backgroundColor: 'currentColor',
            maskImage: 'url(/img/gw2_boon.svg)',
            WebkitMaskImage: 'url(/img/gw2_boon.svg)',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            maskSize: 'contain',
            WebkitMaskSize: 'contain'
        }}
    />
);
