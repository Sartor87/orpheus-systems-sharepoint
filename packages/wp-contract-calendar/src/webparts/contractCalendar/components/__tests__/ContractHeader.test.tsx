import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { setIconOptions } from '@fluentui/react';
import ContractHeader from '../ContractHeader';

setIconOptions({ disableWarnings: true });

describe('ContractHeader brand', () => {
  it('links to the Orpheus Systems website in a new tab', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      ReactDom.render(
        <ContractHeader contracts={[]} readOnly={false} onSelect={() => undefined} onGenerateTimesheet={() => undefined} />,
        host
      );
    });
    const link = host.querySelector('a[href="https://orpheussystems.com/"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('Orpheus');
    expect(link.textContent).toContain('Systems');
    expect(link.querySelector('svg')).not.toBeNull();
    ReactDom.unmountComponentAtNode(host);
    host.remove();
  });
});
