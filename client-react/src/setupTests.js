import Enzyme from 'enzyme';
import ReactSixteenAdapter from 'enzyme-adapter-react-16';
import 'jest-date-mock';
import './polyfills/string';
Enzyme.configure({
  adapter: new ReactSixteenAdapter(),
});
jest.doMock('react-i18next', () => ({
  // this mock makes sure any components using the translate HoC receive the t function as a prop
  translate: () => Component => {
    Component.defaultProps = {
      ...Component.defaultProps,
      t: () => '',
    };
    return Component;
  },
}));
