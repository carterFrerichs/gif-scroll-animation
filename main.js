const Apify = require('apify')
const { log } = Apify.utils
const GifEncoder = require('gif-encoder')
const {
  takeScreenshot,
  gifAddFrame,
  scrollDownProcess,
  getGifBuffer,
  compressGif,
  saveGif,
  slowDownAnimations
} = require('./helper')


Apify.main(async () => {
  const input = await Apify.getInput()

  const browser = await Apify.launchPuppeteer({
    useChrome: false
  })
  const page = await browser.newPage()

  log.info(`Setting page viewport to ${input.viewport.width}x${input.viewport.height}`)
  await page.setViewport({
    width: input.viewport.width,
    height: input.viewport.height
  })

  if (input.slowDownAnimations) {
    slowDownAnimations(page)
  }

  log.info(`Opening page: ${input.url}`)
  await page.goto(input.url, { waitUntil: 'networkidle2' })

  // set up gif encoder
  let chunks = []
  let gif = new GifEncoder(input.viewport.width, input.viewport.height)

  gif.setFrameRate(input.frameRate)
  gif.on('data', (chunk) => chunks.push(chunk))
  gif.writeHeader()

  const waitTime = input.waitToLoadPage * 1000  //convert from seconds to milliseconds
  if (waitTime) {
    log.info(`Wait for ${waitTime} ms so that page is fully loaded`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }

  // click cookie pop-up away
  if (input.acceptCookieSelector) {
    log.info('Clicking cookie pop-up away')
    await page.waitForSelector(input.acceptCookieSelector)
    await page.click(input.acceptCookieSelector)
  }

  // add first frame multiple times so there is some delay before gif starts visually scrolling
  const framesBeforeAction = input.captureBeforeAction * input.frameRate
  for (itt = 0; itt < framesBeforeAction; itt++) {
    const screenshotBuffer = await takeScreenshot(page, input)  // take screenshot each time so animations also show well
    await gifAddFrame(screenshotBuffer, gif)
  }

  // start scrolling down and take screenshots
  await scrollDownProcess(page, gif, input)
  browser.close()

  gif.finish()
  const gifBuffer = await getGifBuffer(gif, chunks)

  const siteName = input.url.match(/(\w+\.)?[\w-]+\.\w+/g)
  const baseFileName = `${siteName}-scroll`

  try {
    const orignialGifSaved = await saveGif(`${baseFileName}_original`, gifBuffer)

    if (input.compression.lossy) {
      const lossyBuffer = await compressGif(gifBuffer, 'lossy')
      log.info('Lossy compression finished')
      const lossyGifSaved = await saveGif(`${baseFileName}_lossy-comp`, lossyBuffer)
    }

    if (input.compression.losless) {
      const loslessBuffer = await compressGif(gifBuffer, 'losless')
      log.info('Losless compression finished')
      const loslessGifSaved = await saveGif(`${baseFileName}_losless-comp`, loslessBuffer)
    }
  } catch (error) {
    log.error(error)
  }

  log.info('Actor finished')
})
