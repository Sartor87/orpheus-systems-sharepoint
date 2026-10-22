import * as React from 'react';
import {
  orpheusMarkFrame,
  orpheusMarkPoints,
  orpheusMarkStrokeWidth,
  orpheusMarkViewBox
} from '@orpheussystems/shared-ui/brand';

export interface IOrpheusMarkProps {
  size: number;
  color: string;
}

const OrpheusMark: React.FC<IOrpheusMarkProps> = ({ size, color }) => (
  <svg
    width={size}
    height={size}
    viewBox={orpheusMarkViewBox}
    fill="none"
    stroke={color}
    strokeWidth={orpheusMarkStrokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect {...orpheusMarkFrame} />
    <polyline points={orpheusMarkPoints} />
  </svg>
);

export default OrpheusMark;
