type Gw2SigilIconProps = {
    className?: string;
};

export const Gw2SigilIcon = ({ className = '' }: Gw2SigilIconProps) => (
    <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`.trim()}
        style={{
            backgroundColor: 'currentColor',
            maskImage: 'url(/img/gw2_sigil.svg)',
            WebkitMaskImage: 'url(/img/gw2_sigil.svg)',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            maskSize: 'contain',
            WebkitMaskSize: 'contain'
        }}
    />
);
