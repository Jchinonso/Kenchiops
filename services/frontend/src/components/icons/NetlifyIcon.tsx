interface NetlifyIconProps {
  readonly className?: string;
}

export const NetlifyIcon = ({ className }: NetlifyIconProps) => (
  <svg viewBox="0 0 256 256" fill="currentColor" className={className} aria-hidden="true">
    <path d="M170.4 3.7l12.5 12.5-45.2 45.2-11.1-3-.8-.8L170.4 3.7zM96 68.5l20.1 5.5 5.5 20.1-46.3 46.3H63.4L10.9 87.9l17.3-17.3 36.7 9.9 1.2-1.2L96 68.5zm75.6 8.2l24.3 24.3-39.5 39.5-20.1-5.5-5.5-20.1 40.8-38.2zm45 44.9l28.5 28.5-27.9 27.9-36.7-9.9-1.2 1.2L155 179.8l-20.1-5.5-5.5-20.1 46.3-46.3h11.9zm-88.2 18.8l5.5 20.1-40.8 40.8-24.3-24.3 39.5-39.5 20.1 5.5v-2.6zm73.7 53.3l-12.5 12.5-45.2-45.2 11.1-3 .8-.8 45.8 36.5zM85.3 252.3L72.8 239.8l45.2-45.2 11.1 3 .8.8-44.6 53.9z" />
  </svg>
);
