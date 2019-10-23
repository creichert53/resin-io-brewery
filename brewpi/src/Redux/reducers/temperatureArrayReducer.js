import {
  UPDATE_TEMPERATURE_ARRAY
} from '../types'

const initialState = []

export default (state = initialState, action) => {
  switch(action.type){
    case UPDATE_TEMPERATURE_ARRAY:
      return action.payload
    default:
      return state;
  }
}