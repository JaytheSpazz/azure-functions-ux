import React, { useState, useEffect, useContext } from 'react';
import { ArmObj } from '../../../../../models/arm-obj';
import { FunctionInfo } from '../../../../../models/functions/function-info';
import LoadingComponent from '../../../../../components/Loading/LoadingComponent';
import { FunctionEditor } from './FunctionEditor';
import { ArmSiteDescriptor } from '../../../../../utils/resourceDescriptors';
import FunctionEditorData from './FunctionEditor.data';
import { Site } from '../../../../../models/site/site';
import { SiteRouterContext } from '../../../SiteRouter';
import Url from '../../../../../utils/url';
import { NameValuePair, ResponseContent, UrlObj, UrlType, urlParameterRegExp } from './FunctionEditor.types';
import AppKeyService from '../../../../../ApiHelpers/AppKeysService';
import FunctionsService from '../../../../../ApiHelpers/FunctionsService';
import { BindingManager } from '../../../../../utils/BindingManager';
import { AppKeysInfo } from '../../app-keys/AppKeys.types';
import SiteService from '../../../../../ApiHelpers/SiteService';
import { CommonConstants } from '../../../../../utils/CommonConstants';
import { RuntimeExtensionMajorVersions, RuntimeExtensionCustomVersions } from '../../../../../models/functions/runtime-extension';
import { Host } from '../../../../../models/functions/host';
import LogService from '../../../../../utils/LogService';
import { LogCategories } from '../../../../../utils/LogCategories';
import { VfsObject } from '../../../../../models/functions/vfs';
import { Method } from 'axios';
import { getJsonHeaders } from '../../../../../ApiHelpers/HttpClient';
import AppInsightsService from '../../../../../ApiHelpers/AppInsightsService';
import { StartupInfoContext } from '../../../../../StartupInfoContext';
import { AppInsightsComponent } from '../../../../../models/app-insights';
import { shrinkEditorStyle } from './FunctionEditor.styles';
import { ValidationRegex } from '../../../../../utils/constants/ValidationRegex';
import { KeyValue } from '../../../../../models/portal-models';

interface FunctionEditorDataLoaderProps {
  resourceId: string;
}

const functionEditorData = new FunctionEditorData();
export const FunctionEditorContext = React.createContext(functionEditorData);

const FunctionEditorDataLoader: React.FC<FunctionEditorDataLoaderProps> = props => {
  const { resourceId } = props;
  const [initialLoading, setInitialLoading] = useState(true);
  const [site, setSite] = useState<ArmObj<Site> | undefined>(undefined);
  const [functionInfo, setFunctionInfo] = useState<ArmObj<FunctionInfo> | undefined>(undefined);
  const [hostKeys, setHostKeys] = useState<AppKeysInfo | undefined>(undefined);
  const [functionKeys, setFunctionKeys] = useState<KeyValue<string>>({});
  const [runtimeVersion, setRuntimeVersion] = useState<string | undefined>(undefined);
  const [hostJsonContent, setHostJsonContent] = useState<Host | undefined>(undefined);
  const [fileList, setFileList] = useState<VfsObject[] | undefined>(undefined);
  const [responseContent, setResponseContent] = useState<ResponseContent | undefined>(undefined);
  const [functionRunning, setFunctionRunning] = useState(false);
  const [appInsightsToken, setAppInsightsToken] = useState<string | undefined>(undefined);
  const [hostUrls, setHostUrls] = useState<UrlObj[]>([]);
  const [functionUrls, setFunctionUrls] = useState<UrlObj[]>([]);
  const [appInsightsComponent, setAppInsightsComponent] = useState<ArmObj<AppInsightsComponent> | undefined>(undefined);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [appPermission, setAppPermission] = useState(true);
  const [testData, setTestData] = useState<string | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const siteContext = useContext(SiteRouterContext);
  const startupInfoContext = useContext(StartupInfoContext);

  const fetchData = async () => {
    const armSiteDescriptor = new ArmSiteDescriptor(resourceId);
    const siteResourceId = armSiteDescriptor.getTrimmedResourceId();
    const [
      siteResponse,
      functionInfoResponse,
      appSettingsResponse,
      appKeysResponse,
      functionKeysResponse,
      hostStatusResponse,
    ] = await Promise.all([
      siteContext.fetchSite(siteResourceId),
      functionEditorData.getFunctionInfo(resourceId),
      SiteService.fetchApplicationSettings(siteResourceId),
      AppKeyService.fetchKeys(siteResourceId),
      FunctionsService.fetchKeys(resourceId),
      SiteService.fetchFunctionsHostStatus(siteResourceId),
    ]);

    if (siteResponse.metadata.success) {
      setSite(siteResponse.data);
    } else {
      LogService.error(LogCategories.FunctionEdit, 'fetchSite', `Failed to fetch site: ${siteResponse.metadata.error}`);
    }

    if (functionInfoResponse.metadata.success) {
      setFunctionInfo(functionInfoResponse.data);
    } else {
      LogService.error(LogCategories.FunctionEdit, 'getFunction', `Failed to get function info: ${functionInfoResponse.metadata.error}`);
    }

    if (appSettingsResponse.metadata.success && appSettingsResponse.data.properties) {
      const appSettings = appSettingsResponse.data.properties;
      const appInsightsConnectionString = appSettings[CommonConstants.AppSettingNames.appInsightsConnectionString];
      const appInsightsInstrumentationKey = appSettings[CommonConstants.AppSettingNames.appInsightsInstrumentationKey];

      const appInsightsResponse = await (appInsightsConnectionString
        ? AppInsightsService.getAppInsightsComponentFromConnectionString(appInsightsConnectionString, startupInfoContext.subscriptions)
        : appInsightsInstrumentationKey
        ? AppInsightsService.getAppInsightsComponentFromInstrumentationKey(appInsightsInstrumentationKey, startupInfoContext.subscriptions)
        : null);

      if (appInsightsResponse) {
        setAppInsightsComponent(appInsightsResponse as ArmObj<AppInsightsComponent>);
      }
    } else {
      if (appSettingsResponse.metadata.status === 403) {
        // RBAC Permissions
        setAppPermission(false);
      }
      LogService.error(LogCategories.FunctionEdit, 'fetchAppSetting', `Failed to fetch app setting: ${appSettingsResponse.metadata.error}`);
    }

    if (hostStatusResponse.metadata.success) {
      const hostStatusData = hostStatusResponse.data;
      const currentRuntimeVersion = getRuntimeVersionString(hostStatusData.properties.version);
      setRuntimeVersion(currentRuntimeVersion);
      const [hostJsonResponse, fileListResponse] = await Promise.all([
        FunctionsService.getHostJson(siteResourceId, functionInfoResponse.data.properties.name, currentRuntimeVersion),
        FunctionsService.getFileContent(siteResourceId, functionInfoResponse.data.properties.name, currentRuntimeVersion),
      ]);
      if (hostJsonResponse && hostJsonResponse.metadata.success) {
        setHostJsonContent(hostJsonResponse.data);
      } else {
        LogService.error(LogCategories.FunctionEdit, 'getHostJson', `Failed to get host json file: ${hostJsonResponse.metadata.error}`);
      }

      if (fileListResponse && fileListResponse.metadata.success) {
        setFileList(fileListResponse.data as VfsObject[]);
      } else {
        LogService.error(LogCategories.FunctionEdit, 'getFileContent', `Failed to get file content: ${fileListResponse.metadata.error}`);
      }
    }

    if (appKeysResponse.metadata.success) {
      setHostKeys(appKeysResponse.data);
    } else {
      LogService.error(LogCategories.FunctionEdit, 'fetchAppKeys', `Failed to fetch app keys: ${appKeysResponse.metadata.error}`);
    }

    if (functionKeysResponse.metadata.success) {
      setFunctionKeys(functionKeysResponse.data);
    } else {
      LogService.error(
        LogCategories.FunctionEdit,
        'fetchFunctionKeys',
        `Failed to fetch function keys: ${functionKeysResponse.metadata.error}`
      );
    }

    setInitialLoading(false);
    setIsRefreshing(false);
  };

  const getRuntimeVersionString = (exactVersion: string): string => {
    if (ValidationRegex.runtimeVersion.test(exactVersion)) {
      const versionElements = exactVersion.split('.');
      return `~${versionElements[0]}`;
    }
    return exactVersion;
  };

  const createAndGetFunctionInvokeUrlPath = (key?: string) => {
    if (functionInfo) {
      const httpTriggerTypeInfo = BindingManager.getHttpTriggerTypeInfo(functionInfo.properties);
      const webHookTypeInfoInfo = BindingManager.getWebHookTypeInfo(functionInfo.properties);
      const authLevelInfo = BindingManager.getAuthLevelInfo(functionInfo.properties);
      if (httpTriggerTypeInfo) {
        let code = '';
        let clientId = '';
        const queryParams: string[] = [];
        const result = getResultFromHostJson();
        const functionKey = key || functionKeys.default;

        code = !!functionKey ? functionKey : '';

        if (!!webHookTypeInfoInfo && functionKey) {
          if (hostKeys) {
            const allKeys = { ...hostKeys.functionKeys, ...hostKeys.systemKeys };
            const keyWithValue = Object.keys(allKeys).find(k => allKeys[k] === functionKey);
            clientId = !!keyWithValue ? keyWithValue : '';
          }
          if (webHookTypeInfoInfo.webHookType.toLowerCase() !== 'genericjson') {
            code = '';
          }
        }

        if (authLevelInfo && authLevelInfo.authLevel.toLowerCase() === 'anonymous') {
          code = '';
        }

        if (code) {
          queryParams.push(`code=${code}`);
        }

        if (clientId) {
          queryParams.push(`clientId=${clientId}`);
        }
        return getFunctionInvokeUrlPath(result, queryParams);
      }
    } else {
      LogService.error(
        LogCategories.functionInvokeUrl,
        'GetFunctionInvokeUrl',
        `No function Info found for the site: ${JSON.stringify(site)}`
      );
    }
    return '';
  };

  const getResultFromHostJson = (): string => {
    let result = '';
    switch (runtimeVersion) {
      case RuntimeExtensionCustomVersions.beta:
      case RuntimeExtensionMajorVersions.v2:
      case RuntimeExtensionMajorVersions.v3: {
        result =
          hostJsonContent &&
          hostJsonContent.extensions &&
          hostJsonContent.extensions.http &&
          hostJsonContent.extensions.http.routePrefix !== undefined &&
          hostJsonContent.extensions.http.routePrefix !== null
            ? hostJsonContent.extensions.http.routePrefix
            : 'api';
        break;
      }
      case RuntimeExtensionMajorVersions.v1:
      default: {
        result =
          hostJsonContent &&
          hostJsonContent.http &&
          hostJsonContent.http.routePrefix !== undefined &&
          hostJsonContent.http.routePrefix !== null
            ? hostJsonContent.http.routePrefix
            : 'api';
      }
    }
    return result;
  };

  const getFunctionInvokeUrlPath = (result: string, queryParams: string[]) => {
    if (functionInfo) {
      let path = '/';
      const httpTriggerTypeInfo = BindingManager.getHttpTriggerTypeInfo(functionInfo.properties);
      if (httpTriggerTypeInfo && httpTriggerTypeInfo.route) {
        path += `${result}/${httpTriggerTypeInfo.route}`;
      } else {
        path += `${result}/${functionInfo.properties.name}`;
      }

      // Remove doubled slashes
      const re = new RegExp('//', 'g');
      path = path.replace(re, '/').replace('/?', '?');
      path = `${path}${path.endsWith('?') ? '' : '?'}${queryParams.join('&')}`;
      return path.endsWith('?') ? path.slice(0, -1) : path;
    }
    return '';
  };

  const getHeaders = (testHeaders: NameValuePair[], xFunctionKey?: string): KeyValue<string> => {
    const headers = getJsonHeaders();
    testHeaders.forEach(h => {
      headers[h.name] = h.value;
    });

    if (hostKeys && hostKeys.masterKey) {
      headers['Cache-Control'] = 'no-cache';
      headers['x-functions-key'] = !!xFunctionKey ? getXFunctionKeyValue(xFunctionKey) : hostKeys.masterKey;
    }
    return headers;
  };

  const run = async (newFunctionInfo: ArmObj<FunctionInfo>, xFunctionKey?: string) => {
    setFunctionRunning(true);
    const updatedFunctionInfo = await functionEditorData.updateFunctionInfo(resourceId, newFunctionInfo);
    if (updatedFunctionInfo.metadata.success) {
      const data = updatedFunctionInfo.data;
      setFunctionInfo(data);
      if (!!site) {
        let url = `${Url.getMainUrl(site)}${createAndGetFunctionInvokeUrlPath()}`;
        let parsedTestData = {};
        try {
          parsedTestData = JSON.parse(newFunctionInfo.properties.test_data);
        } catch (err) {
          // TODO (krmitta): Log an error if parsing the data throws an error
        }
        const testDataObject = functionEditorData.getProcessedFunctionTestData(parsedTestData);
        const queries = testDataObject.queries;

        const matchesPathParams = url.match(urlParameterRegExp);
        const processedParams: string[] = [];
        if (matchesPathParams) {
          matchesPathParams.forEach(m => {
            const name = m
              .split(':')[0]
              .replace('{', '')
              .replace('}', '')
              .toLowerCase();
            processedParams.push(name);
            const param = queries.find(p => {
              return p.name.toLowerCase() === name;
            });

            if (param) {
              url = url.replace(m, param.value);
            }
          });
        }

        const filteredQueryParams = queries.filter(query => {
          return !processedParams.find(p => p === query.name);
        });
        const queryString = getQueryString(filteredQueryParams);
        if (!!queryString) {
          url = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
        }

        const headers = getHeaders(testDataObject.headers, xFunctionKey);
        try {
          const res = await FunctionsService.runFunction(url, testDataObject.method as Method, headers, testDataObject.body);
          setResponseContent({
            code: res.metadata.status,
            text: res.metadata.success ? res.data : res.metadata.error,
          });
        } catch (err) {
          // TODO (krmitta): Show an error if the call to run the function fails
        }
      }
    }
    setFunctionRunning(false);
  };

  const getQueryString = (queries: NameValuePair[]): string => {
    const queryString = queries.map(query => `${encodeURIComponent(query.name)}=${encodeURIComponent(query.value)}`);
    return queryString.join('&');
  };

  const getFunctionUrl = (key?: string) => {
    return !!site ? `${Url.getMainUrl(site)}${createAndGetFunctionInvokeUrlPath(key)}` : '';
  };

  const setUrlsAndOptions = (keys: KeyValue<string>, keyType: UrlType) => {
    const newUrlsObj: UrlObj[] = [];
    for (const key in keys) {
      if (key in keys) {
        newUrlsObj.push({
          key: `${key} - ${keyType}`,
          text: key,
          type: keyType,
          url: getFunctionUrl(keys[key]),
          data: keys[key],
        });
      }
    }
    if (keyType === UrlType.Host) {
      setHostUrls(newUrlsObj);
    } else {
      setFunctionUrls(newUrlsObj);
    }
  };

  const resetAppInsightsToken = () => {
    setAppInsightsToken(undefined);
  };

  const getKeyHeader = (): KeyValue<string> => {
    if (hostKeys && hostKeys.masterKey) {
      return {
        'Cache-Control': 'no-cache',
        'x-functions-key': hostKeys.masterKey,
      };
    }
    return {};
  };

  const getAndSetTestData = async () => {
    if (!!functionInfo && !!hostKeys && !!functionInfo.properties.test_data_href) {
      const headers = getKeyHeader();
      const testDataResponse = await FunctionsService.getDataFromFunctionHref(functionInfo.properties.test_data_href, 'GET', headers);
      if (testDataResponse.metadata.success) {
        let data = testDataResponse.data;
        try {
          data = JSON.stringify(testDataResponse.data);
        } catch (err) {
          LogService.error(LogCategories.FunctionEdit, 'invalid-test-data', err);
        }
        setTestData(data as string);
      }
    }
  };

  const refresh = async () => {
    if (!!site) {
      setIsRefreshing(true);
      SiteService.fireSyncTrigger(site, startupInfoContext.token).then(r => {
        fetchData();
        if (!r.metadata.success) {
          LogService.error(LogCategories.FunctionEdit, 'fireSyncTrigger', `Failed to fire syncTrigger: ${r.metadata.error}`);
        }
      });
    }
  };

  const getDefaultXFunctionKey = (): string => {
    return hostKeys && hostKeys.masterKey ? `master - Host` : '';
  };

  const getXFunctionKeyValue = (xFunctionKey: string): string => {
    for (const url in functionUrls) {
      if (url in functionUrls && functionUrls[url].key === xFunctionKey) {
        return functionUrls[url].data as string;
      }
    }
    for (const url in hostUrls) {
      if (url in hostUrls && hostUrls[url].key === xFunctionKey) {
        return hostUrls[url].data as string;
      }
    }
    return '';
  };

  useEffect(() => {
    fetchData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (appInsightsComponent && !appInsightsToken) {
      AppInsightsService.getAppInsightsComponentToken(appInsightsComponent.id).then(appInsightsComponentTokenResponse => {
        if (appInsightsComponentTokenResponse.metadata.success) {
          setAppInsightsToken(appInsightsComponentTokenResponse.data.token);
        } else {
          LogService.error(
            LogCategories.FunctionEdit,
            'getAppInsightsComponentToken',
            `Failed to get App Insights Component Token: ${appInsightsComponent}`
          );
        }
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appInsightsComponent, appInsightsToken]);

  useEffect(() => {
    if (!!site && !!functionInfo) {
      if (!!hostKeys) {
        setUrlsAndOptions({ master: hostKeys.masterKey, ...hostKeys.functionKeys, ...hostKeys.systemKeys }, UrlType.Host);
      }
      if (!!functionKeys) {
        setUrlsAndOptions(functionKeys, UrlType.Function);
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, functionInfo, hostKeys, functionKeys]);

  useEffect(() => {
    getAndSetTestData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionInfo, hostKeys]);
  // TODO (krmitta): Show a loading error message site or functionInfo call fails
  if (initialLoading || !site || !functionInfo) {
    return <LoadingComponent />;
  }
  return (
    <FunctionEditorContext.Provider value={functionEditorData}>
      <div style={showTestPanel ? shrinkEditorStyle(window.innerWidth) : undefined}>
        <FunctionEditor
          functionInfo={functionInfo}
          site={site}
          run={run}
          fileList={fileList}
          runtimeVersion={runtimeVersion}
          responseContent={responseContent}
          functionRunning={functionRunning}
          appInsightsToken={appInsightsToken}
          urlObjs={[...functionUrls, ...hostUrls]}
          resetAppInsightsToken={resetAppInsightsToken}
          showTestPanel={showTestPanel}
          setShowTestPanel={setShowTestPanel}
          appPermission={appPermission}
          testData={testData}
          refresh={refresh}
          isRefreshing={isRefreshing}
          xFunctionKey={getDefaultXFunctionKey()}
          appInsightsResourceId={appInsightsComponent ? appInsightsComponent.id : ''}
          getFunctionUrl={getFunctionUrl}
        />
      </div>
      {isRefreshing && <LoadingComponent overlay={true} />}
    </FunctionEditorContext.Provider>
  );
};

export default FunctionEditorDataLoader;
