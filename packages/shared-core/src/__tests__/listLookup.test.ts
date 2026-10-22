import { normaliseWebRelativeUrl } from '../data/webUrl';
import { contractsOfContractorQuery } from '../data/spQueries';

describe('normaliseWebRelativeUrl', () => {
  it('strips web prefix and slashes', () => {
    expect(normaliseWebRelativeUrl('/sites/x/Lists/Contracts/', '/sites/x')).toBe('Lists/Contracts');
  });
  it('keeps an already relative url', () => {
    expect(normaliseWebRelativeUrl('Lists/Contracts', '/sites/x')).toBe('Lists/Contracts');
  });
  it('handles a root web', () => {
    expect(normaliseWebRelativeUrl('/Lists/Contracts', '/')).toBe('Lists/Contracts');
  });
});

describe('contractsOfContractorQuery', () => {
  it('builds the contractor filter', () => {
    expect(contractsOfContractorQuery(11)).toBe('ContractorId eq 11');
  });
});
