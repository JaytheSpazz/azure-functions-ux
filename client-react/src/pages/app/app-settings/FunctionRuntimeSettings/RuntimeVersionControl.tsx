import React, { useContext, useState } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { FormAppSetting, FunctionsRuntimeMajorVersions, AppSettingsFormProps } from '../AppSettings.types';
import { PermissionsContext } from '../Contexts';
import { findFormAppSetting, findFormAppSettingIndex } from '../AppSettingsFormData';
import { CommonConstants } from '../../../../utils/CommonConstants';
import InfoBox, { InfoBoxProps } from '../../../../components/InfoBox/InfoBox';
import DropdownNoFormik from '../../../../components/form-controls/DropDownnoFormik';
import { IDropdownOption } from 'office-ui-fabric-react';

const getFunctionsRuntimeMajorVersion = (version: string | null) => {
  switch (version) {
    case FunctionsRuntimeMajorVersions.v1:
      return FunctionsRuntimeMajorVersions.v1;
    case FunctionsRuntimeMajorVersions.v2:
      return FunctionsRuntimeMajorVersions.v2;
    case FunctionsRuntimeMajorVersions.v3:
      return FunctionsRuntimeMajorVersions.v3;
    default:
      return FunctionsRuntimeMajorVersions.custom;
  }
};

const parseExactRuntimeVersion = (exactRuntimeVersion: string) => {
  if (exactRuntimeVersion.startsWith('1.')) {
    return FunctionsRuntimeMajorVersions.v1;
  }

  if (exactRuntimeVersion.startsWith('2.')) {
    return FunctionsRuntimeMajorVersions.v2;
  }

  if (exactRuntimeVersion.startsWith('3.')) {
    return FunctionsRuntimeMajorVersions.v3;
  }

  return FunctionsRuntimeMajorVersions.v3;
};

const getRuntimeVersion = (appSettings: FormAppSetting[]) => {
  const appSetting = findFormAppSetting(appSettings, CommonConstants.AppSettingNames.functionsExtensionVersion);
  return appSetting && appSetting.value;
};

const RuntimeVersionControl: React.FC<AppSettingsFormProps & WithTranslation> = props => {
  const [latestCustomRuntimeVersion, setLatestCustomRuntimeVersion] = useState<string | null | undefined>(undefined);
  const { t, values, initialValues, asyncData, setFieldValue } = props;
  const { app_write, editable, saving } = useContext(PermissionsContext);
  const disableAllControls = !app_write || !editable || saving;

  const getInfoBox = () => {
    if (initialRuntimeMajorVersion !== FunctionsRuntimeMajorVersions.custom) {
      return { message: '' };
    }

    if (!initialRuntimeVersion) {
      return {
        message: exactRuntimeVersion
          ? t('functionsRuntimeVersionMissingWarning')
          : t('functionsRuntimeVersionMissingWithExactVersionWarning').format(exactRuntimeVersion),
        type: 'Warning',
      };
    }

    if (initialRuntimeVersion.toLowerCase() === 'latest' || initialRuntimeVersion.toLowerCase() === 'beta') {
      return {
        message: exactRuntimeVersion
          ? t('functionsRuntimeVersionLatestOrBetaWarning').format(initialRuntimeVersion)
          : t('functionsRuntimeVersionLatestOrBetaWithExactVersionWarning').format(initialRuntimeVersion, exactRuntimeVersion),
        type: 'Warning',
      };
    }

    if (!exactRuntimeVersion) {
      return { message: '' };
    }

    if (initialRuntimeVersion.toLowerCase() === exactRuntimeVersion.toLowerCase().replace(/.0$/, '-alpha')) {
      return {
        message: t('functionsRuntimeVersionNeedsUpdateWarning').format(exactRuntimeVersion),
        type: 'Warning',
      };
    }

    return {
      message: t('functionsRuntimeVersionInvalidWarning').format(initialRuntimeVersion, exactRuntimeVersion),
      type: 'Error',
    };
  };

  const getDropDown = () => {
    let versionFilter: FunctionsRuntimeMajorVersions | null = null;
    let placeHolder = '';

    if (asyncData.functionsCount.loadingState === 'loading') {
      versionFilter = null;
      placeHolder = t('loading');
    } else if (asyncData.functionsCount.value === 0) {
      versionFilter = null;
      placeHolder = '';
    } else if (initialRuntimeMajorVersion !== FunctionsRuntimeMajorVersions.custom) {
      versionFilter = initialRuntimeMajorVersion;
      placeHolder = '';
    } else if (asyncData.functionsHostStatus.loadingState === 'loading') {
      versionFilter = null;
      placeHolder = t('loading');
    } else if (asyncData.functionsHostStatus.loadingState === 'complete') {
      versionFilter = parseExactRuntimeVersion(asyncData.functionsHostStatus.value!.properties.version);
      placeHolder = '';
    } else {
      versionFilter = null;
      placeHolder = t('failedToLoad');
    }

    const options: IDropdownOption[] = [
      {
        key: FunctionsRuntimeMajorVersions.v1,
        text: t('~1'),
        disabled: !!versionFilter && versionFilter !== FunctionsRuntimeMajorVersions.v1,
      },
      {
        key: FunctionsRuntimeMajorVersions.v2,
        text: t('~2'),
        disabled: !!versionFilter && versionFilter !== FunctionsRuntimeMajorVersions.v2,
      },
      {
        key: FunctionsRuntimeMajorVersions.v3,
        text: t('version3Preview'),
        disabled: !!versionFilter && versionFilter !== FunctionsRuntimeMajorVersions.v3,
      },
    ];

    if (latestCustomRuntimeVersion !== undefined || runtimeMajorVersion === FunctionsRuntimeMajorVersions.custom) {
      options.unshift({
        key: FunctionsRuntimeMajorVersions.custom,
        text: t('custom'),
        disabled: false,
      });
    }

    return { disabledPlaceHolder: placeHolder, versionOptions: options };
  };

  const getLatestCustomRuntimeVersion = () => {
    return latestCustomRuntimeVersion !== undefined ? latestCustomRuntimeVersion : initialRuntimeMajorVersion;
  };

  const onDropDownChange = newVersion => {
    if (runtimeMajorVersion === FunctionsRuntimeMajorVersions.custom) {
      setLatestCustomRuntimeVersion(runtimeVersion);
    }

    const version = newVersion === FunctionsRuntimeMajorVersions.custom ? getLatestCustomRuntimeVersion() : newVersion;
    const appSettings: FormAppSetting[] = [...values.appSettings];
    const index = findFormAppSettingIndex(appSettings, CommonConstants.AppSettingNames.functionsExtensionVersion);
    if (index === -1) {
      if (version !== null) {
        appSettings.push({
          name: CommonConstants.AppSettingNames.functionsExtensionVersion,
          value: version,
          sticky: false,
        });
      }
    } else if (version !== null) {
      appSettings[index] = { ...appSettings[index], value: version };
    } else {
      appSettings.splice(index, 1);
    }
    setFieldValue('appSettings', appSettings);
  };

  const functionsHostStatus = asyncData.functionsHostStatus.value;
  const exactRuntimeVersion = functionsHostStatus && functionsHostStatus.properties.version;

  const runtimeVersion = getRuntimeVersion(values.appSettings);
  const runtimeMajorVersion = getFunctionsRuntimeMajorVersion(runtimeVersion);

  const initialRuntimeVersion = getRuntimeVersion(initialValues.appSettings);
  const initialRuntimeMajorVersion = getFunctionsRuntimeMajorVersion(initialRuntimeVersion);

  const { disabledPlaceHolder, versionOptions } = getDropDown();
  const { message, type: messageType } = getInfoBox() as Partial<InfoBoxProps>;

  return (
    <>
      {!!message && <InfoBox id="function-app-settings-runtime-version-message" type={messageType} message={message} />}
      <DropdownNoFormik
        placeHolder={disabledPlaceHolder}
        value={runtimeMajorVersion}
        dirty={runtimeMajorVersion !== initialRuntimeMajorVersion}
        onChange={(event, option) => onDropDownChange(option.key)}
        options={versionOptions}
        disabled={disableAllControls || !!disabledPlaceHolder}
        label={t('runtimeVersion')}
        id="function-app-settings-runtime-version"
        infoBubbleMessage={
          !disabledPlaceHolder && runtimeMajorVersion === FunctionsRuntimeMajorVersions.custom
            ? t('functionsRuntimeVersionCustomInfo')
            : undefined
        }
      />
    </>
  );
};

export default withTranslation('translation')(RuntimeVersionControl);
