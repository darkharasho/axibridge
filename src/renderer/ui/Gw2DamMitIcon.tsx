type Gw2DamMitIconProps = {
    className?: string;
};

export const Gw2DamMitIcon = ({ className = '' }: Gw2DamMitIconProps) => (
    <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`.trim()}
        style={{
            backgroundColor: 'currentColor',
            maskImage: 'url(/img/dam_mit.svg)',
            WebkitMaskImage: 'url(/img/dam_mit.svg)',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            maskSize: 'contain',
            WebkitMaskSize: 'contain'
        }}
    />
);
