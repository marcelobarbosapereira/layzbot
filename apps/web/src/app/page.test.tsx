import { render, screen } from '@testing-library/react';
import Home from './page';

it('identifies the application and its monthly workflow', () => {
  render(<Home />);
  expect(screen.getByRole('heading', { name: 'LazyBot' })).toBeVisible();
  expect(screen.getByText('Apurações mensais')).toBeVisible();
});
