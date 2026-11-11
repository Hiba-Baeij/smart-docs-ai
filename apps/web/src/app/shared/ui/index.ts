/**
 * The app's UI kit (ADR-019). Presentational only: inputs in, outputs out, no stores or HTTP.
 * Features import from here (`@shared/ui`), never from Angular Material directly.
 */
export { Badge, type BadgeTone } from './badge/badge';
export { Button, type ButtonSize, type ButtonVariant } from './button/button';
export { Card } from './card/card';
export { CopyButton } from './copy-button/copy-button';
export { Detail, DetailsGrid } from './details-grid/details-grid';
export { EmptyState } from './empty-state/empty-state';
export { ErrorBanner } from './error-banner/error-banner';
export { FileIcon } from './file-icon/file-icon';
export { type ChipOption, FilterChips } from './filter-chips/filter-chips';
export { IconButton } from './icon-button/icon-button';
export { Menu, type MenuItem } from './menu/menu';
export { PageHeader } from './page-header/page-header';
export { SearchInput } from './search-input/search-input';
export { Skeleton, type SkeletonVariant } from './skeleton/skeleton';
export { Spinner } from './spinner/spinner';
export { StatCard, type StatTone } from './stat-card/stat-card';
export { Tab, Tabs } from './tabs/tabs';
