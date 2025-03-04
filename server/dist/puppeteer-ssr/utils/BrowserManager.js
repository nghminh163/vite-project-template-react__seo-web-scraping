'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
function _interopRequireDefault(obj) {
	return obj && obj.__esModule ? obj : { default: obj }
}
function _optionalChain(ops) {
	let lastAccessLHS = undefined
	let value = ops[0]
	let i = 1
	while (i < ops.length) {
		const op = ops[i]
		const fn = ops[i + 1]
		i += 2
		if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) {
			return undefined
		}
		if (op === 'access' || op === 'optionalAccess') {
			lastAccessLHS = value
			value = fn(value)
		} else if (op === 'call' || op === 'optionalCall') {
			value = fn((...args) => value.call(lastAccessLHS, ...args))
			lastAccessLHS = undefined
		}
	}
	return value
}
var _chromiummin = require('@sparticuz/chromium-min')
var _chromiummin2 = _interopRequireDefault(_chromiummin)
var _path = require('path')
var _path2 = _interopRequireDefault(_path)

var _workerpool = require('workerpool')
var _workerpool2 = _interopRequireDefault(_workerpool)

var _constants = require('../../constants')
var _store = require('../../store')
var _ConsoleHandler = require('../../utils/ConsoleHandler')
var _ConsoleHandler2 = _interopRequireDefault(_ConsoleHandler)

var _constants3 = require('../constants')

const deleteUserDataDir = async (dir) => {
	if (dir) {
		try {
			await _optionalChain([
				_workerpool2.default,
				'access',
				(_) => _.pool,
				'call',
				(_2) =>
					_2(
						_path2.default.resolve(
							__dirname,
							`./FollowResource.worker/index.${_constants.resourceExtension}`
						)
					),
				'optionalAccess',
				(_3) => _3.exec,
				'call',
				(_4) => _4('deleteResource', [dir]),
			])
		} catch (err) {
			_ConsoleHandler2.default.log('BrowserManager line 39:')
			_ConsoleHandler2.default.error(err)
		}
	}
}
exports.deleteUserDataDir = deleteUserDataDir // deleteUserDataDir

const _getSafePage = (page) => {
	let SafePage = page

	return () => {
		if (SafePage && SafePage.isClosed()) return
		return SafePage
	}
} // _getSafePage

const BrowserManager = (
	userDataDir = () => `${_constants.userDataPath}/user_data`
) => {
	const maxRequestPerBrowser = 20
	let totalRequests = 0
	let browserLaunch
	let reserveUserDataDirPath
	let executablePath

	const __launch = async () => {
		totalRequests = 0

		const selfUserDataDirPath =
			reserveUserDataDirPath ||
			`${userDataDir()}${_constants.IS_REMOTE_CRAWLER ? '_remote' : ''}`
		reserveUserDataDirPath = `${userDataDir()}_reserve${
			_constants.IS_REMOTE_CRAWLER ? '_remote' : ''
		}`

		browserLaunch = new Promise(async (res, rej) => {
			let isError = false
			let promiseBrowser
			const browserStore = (() => {
				const tmpBrowserStore = _store.getStore.call(void 0, 'browser')
				return tmpBrowserStore || {}
			})()
			const promiseStore = (() => {
				const tmpPromiseStore = _store.getStore.call(void 0, 'promise')
				return tmpPromiseStore || {}
			})()

			try {
				if (_constants3.canUseLinuxChromium && !promiseStore.executablePath) {
					_ConsoleHandler2.default.log('Create executablePath')
					promiseStore.executablePath = _chromiummin2.default.executablePath(
						_constants3.chromiumPath
					)
				}

				browserStore.userDataPath = selfUserDataDirPath
				browserStore.reserveUserDataPath = reserveUserDataDirPath

				_store.setStore.call(void 0, 'browser', browserStore)
				_store.setStore.call(void 0, 'promise', promiseStore)

				if (!executablePath && promiseStore.executablePath) {
					executablePath = await promiseStore.executablePath
				}

				if (promiseStore.executablePath) {
					_ConsoleHandler2.default.log('Start browser with executablePath')
					promiseBrowser = _constants3.puppeteer.launch({
						..._constants3.defaultBrowserOptions,
						userDataDir: selfUserDataDirPath,
						args: _chromiummin2.default.args,
						executablePath,
					})

					// NOTE - Create a preventive browser to replace when current browser expired
					new Promise(async (res) => {
						const reserveBrowser = await _constants3.puppeteer.launch({
							..._constants3.defaultBrowserOptions,
							userDataDir: reserveUserDataDirPath,
							args: _chromiummin2.default.args,
							executablePath,
						})
						try {
							await reserveBrowser.close()
						} catch (err) {
							_ConsoleHandler2.default.log('BrowserManager line 121')
							_ConsoleHandler2.default.error(err)
						}

						res(null)
					})
				} else {
					_ConsoleHandler2.default.log('Start browser without executablePath')
					promiseBrowser = _constants3.puppeteer.launch({
						..._constants3.defaultBrowserOptions,
						userDataDir: selfUserDataDirPath,
					})

					// NOTE - Create a preventive browser to replace when current browser expired
					new Promise(async (res) => {
						const reserveBrowser = await _constants3.puppeteer.launch({
							..._constants3.defaultBrowserOptions,
							userDataDir: reserveUserDataDirPath,
						})
						try {
							await reserveBrowser.close()
						} catch (err) {
							_ConsoleHandler2.default.log('BrowserManager line 143')
							_ConsoleHandler2.default.error(err)
						}
						res(null)
					})
				}
			} catch (err) {
				isError = true
				_ConsoleHandler2.default.error(err)
			} finally {
				if (isError) return rej(undefined)
				_ConsoleHandler2.default.log('Start browser success!')
				res(promiseBrowser)
			}
		})

		if (browserLaunch) {
			try {
				let tabsClosed = 0
				const browser = await browserLaunch

				browser.on('createNewPage', async (page) => {
					const safePage = _getSafePage(page)
					await new Promise((resolveCloseTab) => {
						const timeoutCloseTab = setTimeout(async () => {
							const tmpPage = safePage()
							if (!tmpPage) resolveCloseTab(null)
							else if (browser.connected && !tmpPage.isClosed()) {
								try {
									await tmpPage.close()
								} catch (err) {
									_ConsoleHandler2.default.log('BrowserManager line 164')
									_ConsoleHandler2.default.error(err)
								}
							}
						}, 180000)

						_optionalChain([
							safePage,
							'call',
							(_5) => _5(),
							'optionalAccess',
							(_6) => _6.once,
							'call',
							(_7) =>
								_7('close', () => {
									clearTimeout(timeoutCloseTab)
									resolveCloseTab(null)
								}),
						])
					})

					tabsClosed++

					if (!_constants.SERVER_LESS && tabsClosed === maxRequestPerBrowser) {
						if (browser.connected)
							try {
								await browser.close()
							} catch (err) {
								_ConsoleHandler2.default.log('BrowserManager line 193')
								_ConsoleHandler2.default.error(err)
							}

						exports.deleteUserDataDir.call(void 0, selfUserDataDirPath)
					}
				})
			} catch (err) {
				_ConsoleHandler2.default.log('Browser manager line 177:')
				_ConsoleHandler2.default.error(err)
			}
		}
	} // __launch()

	if (_constants.POWER_LEVEL === _constants.POWER_LEVEL_LIST.THREE) {
		__launch()
	}

	const _get = async () => {
		if (!browserLaunch || !_isReady()) {
			__launch()
		}

		totalRequests++
		const curBrowserLaunch = browserLaunch

		// const pages = (await (await curBrowserLaunch)?.pages())?.length ?? 0;
		// await new Promise((res) => setTimeout(res, pages * 10));

		return curBrowserLaunch
	} // _get

	const _newPage = async () => {
		let browser
		let page
		try {
			browser = await _get()
			page = await _optionalChain([
				browser,
				'optionalAccess',
				(_8) => _8.newPage,
				'optionalCall',
				(_9) => _9(),
			])

			if (!page) {
				__launch()
				return _newPage()
			}
		} catch (err) {
			__launch()
			return _newPage()
		}

		if (page) browser.emit('createNewPage', page)
		return page
	} // _newPage

	const _isReady = () => {
		return totalRequests < maxRequestPerBrowser
	} // _isReady

	return {
		get: _get,
		newPage: _newPage,
		isReady: _isReady,
	}
}

exports.default = BrowserManager
