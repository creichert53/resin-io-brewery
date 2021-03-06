import React from 'react'

import { MuiThemeProvider, withStyles, createMuiTheme } from '@material-ui/core/styles'
import Card from '@material-ui/core/Card'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'

import isEqual from 'lodash/isEqual'

import moment from 'moment-timezone'

import timeFormat from '../helpers/hhmmss'

const muiTheme = createMuiTheme({
  palette: {
    type: 'light',
  },
  typography: {
    useNextVariants: true
  }
})

const styles = theme => ({
  card: {
    minWidth: 200,
  }
})

class TempTooltip extends React.Component {
  render() {
    const { classes } = this.props

    if (true) {
      const { payload } = this.props

      return (
        <MuiThemeProvider theme={muiTheme}>
          <Card className={classes.card}>
            <List component='div'>
              <ListItem>
                <ListItemText
                  style={{ color: 'black' }}
                  primary={payload && !isEqual(payload, []) ? timeFormat.fromS(payload[0].payload.totalTime, 'hh:mm:ss') : null}
                  secondary={payload && !isEqual(payload, []) ? moment.tz(payload[0].payload.time * 1000, 'America/New_York').format('h:mm:ss A') : null}
                />
              </ListItem>
              {payload && payload.map((line,i) => (
                <ListItem key={i}>
                  <div style={{ height: 40, width: 10, marginRight: 20, backgroundColor: `${line.stroke}` }}></div>
                  <ListItemText
                    primary={`${line.payload[line.dataKey].toFixed(1)} °F`}
                    secondary={`${line.name}`}
                  />
                </ListItem>
              ))}
            </List>
          </Card>
        </MuiThemeProvider>
      );
    }

    return null;
  }
}

TempTooltip.propTypes = {
}

export default withStyles(styles, { withTheme: true })(TempTooltip)
